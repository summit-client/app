// Follow this setup guide to integrate the Deno language server with your editor:
// https://deno.land/manual/getting_started/setup_your_environment
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {
  getCallerProfile,
  handlePreflight,
  isRateLimited,
  json,
  recordAudit,
  serviceClient,
  verifyCaller,
  type AppRole,
} from "../_shared/auth.ts";

/**
 * Who may invite whom, into their own clinic only. Decided 2026-08-28:
 * admin has full authority; scheduler is restricted to the two roles that
 * match their day-to-day (they already create `clients` records for
 * scheduling, so extending a portal login to a family or bringing on a new
 * clinician tracks); supervisor gets zero invite rights in v1.
 */
const INVITE_MATRIX: Partial<Record<AppRole, readonly AppRole[]>> = {
  admin: ["admin", "supervisor", "clinician", "scheduler", "client"],
  scheduler: ["client", "clinician"],
};

const MAX_INVITES_PER_HOUR = 20;

interface InviteRequest {
  email?: string;
  role?: string;
  full_name?: string;
  /** Only meaningful when role === "clinician". */
  supervisor_id?: string;
  /**
   * Required when role === "client" - this attaches an EXISTING scheduler
   * `clients` row (created earlier through normal intake) to a new portal
   * login. This function never creates clinical intake data; it only links
   * an account to a client record that already exists.
   */
  client_id?: number;
}

Deno.serve(async (req) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  const callerId = await verifyCaller(req);
  if (!callerId) return json(401, { error: "Not signed in" });

  const admin = serviceClient();
  const caller = await getCallerProfile(admin, callerId);
  if (!caller || !caller.clinic_id) return json(403, { error: "No clinic on your account" });

  const allowedRoles = INVITE_MATRIX[caller.role];
  if (!allowedRoles) return json(403, { error: "Your role cannot invite anyone" });

  let body: InviteRequest;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "Invalid JSON body" });
  }

  const email = body.email?.trim().toLowerCase();
  const role = body.role as AppRole | undefined;
  if (!email || !role) return json(400, { error: "email and role are required" });
  if (!allowedRoles.includes(role)) {
    return json(403, { error: `Your role cannot invite a ${role}` });
  }

  if (await isRateLimited(admin, callerId, "invite", MAX_INVITES_PER_HOUR)) {
    return json(429, { error: "Too many invites sent. Try again in a bit." });
  }

  let linkedClientId: number | null = null;
  if (role === "client") {
    if (body.client_id == null) {
      return json(400, { error: "client_id is required to invite a client - pick an existing, unlinked client record" });
    }
    const { data: clientRow, error: clientErr } = await admin
      .from("clients")
      .select("id, user_id, clinic_id")
      .eq("id", body.client_id)
      .maybeSingle();
    if (clientErr || !clientRow || clientRow.clinic_id !== caller.clinic_id) {
      return json(404, { error: "No matching client record in your clinic" });
    }
    if (clientRow.user_id) {
      return json(409, { error: "That client already has a portal account" });
    }
    linkedClientId = clientRow.id;
  }

  // Supervisor assignment is only meaningful for a clinician, and always
  // clinic-scoped - never trust a supervisor_id without checking it belongs
  // to the same clinic (that would let one clinic's admin quietly chain a
  // new hire under another clinic's supervisor).
  let supervisorId: string | null = null;
  if (role === "clinician" && body.supervisor_id) {
    const { data: sup } = await admin
      .from("profiles")
      .select("id, clinic_id")
      .eq("id", body.supervisor_id)
      .maybeSingle();
    if (sup && sup.clinic_id === caller.clinic_id) supervisorId = sup.id;
  }

  const { data: invited, error: inviteErr } = await admin.auth.admin.inviteUserByEmail(email);
  if (inviteErr || !invited?.user) {
    return json(500, { error: inviteErr?.message ?? "Could not send invite" });
  }
  const newUserId = invited.user.id;

  if (role === "client" && linkedClientId != null) {
    // A database trigger already created a default profiles row (role
    // 'client', clinic_id null) the instant inviteUserByEmail ran - which
    // happens to be exactly the shape a self-signed-up client's profile
    // already has, so nothing further to write here. Only linking the
    // clients record is this branch's job.
    const { error: linkErr } = await admin.from("clients").update({ user_id: newUserId }).eq("id", linkedClientId);
    if (linkErr) return json(500, { error: "Invite sent, but linking the client record failed: " + linkErr.message });
  } else {
    // upsert, not insert: that same trigger-created default row means a
    // plain insert always loses the race and hits profiles_pkey (confirmed
    // live). This overwrites it with the real role/clinic/supervisor.
    const { error: profileErr } = await admin.from("profiles").upsert({
      id: newUserId,
      email: invited.user.email,
      full_name: body.full_name?.trim() || null,
      role,
      clinic_id: caller.clinic_id,
      supervisor_id: supervisorId,
    }, { onConflict: "id" });
    if (profileErr) return json(500, { error: "Invite sent, but creating the profile failed: " + profileErr.message });
  }

  await recordAudit(admin, {
    actor_id: callerId,
    actor_clinic_id: caller.clinic_id,
    action: "invite",
    target_user_id: newUserId,
    target_clinic_id: caller.clinic_id,
    detail: { email, role, client_id: linkedClientId, supervisor_id: supervisorId },
  });

  return json(200, { ok: true, user_id: newUserId });
});
