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
 * Which roles a caller may move someone INTO. Mirrors invite-teammate's
 * matrix exactly - editing into a role you couldn't have invited into would
 * be the same privilege escalation by a different door.
 */
const EDIT_INTO_MATRIX: Partial<Record<AppRole, readonly AppRole[]>> = {
  admin: ["admin", "supervisor", "clinician", "scheduler", "client"],
  scheduler: ["client", "clinician"],
};

const MAX_EDITS_PER_HOUR = 30;

interface EditRequest {
  target_user_id?: string;
  role?: string;
  supervisor_id?: string | null;
  full_name?: string;
  deactivate?: boolean;
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

  const allowedRoles = EDIT_INTO_MATRIX[caller.role];
  if (!allowedRoles) return json(403, { error: "Your role cannot edit teammates" });

  let body: EditRequest;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "Invalid JSON body" });
  }

  if (!body.target_user_id) return json(400, { error: "target_user_id is required" });
  if (body.target_user_id === callerId) {
    return json(403, { error: "Use your own account settings, not this, to change your own profile" });
  }

  const target = await getCallerProfile(admin, body.target_user_id);
  if (!target || target.clinic_id !== caller.clinic_id) {
    return json(404, { error: "No teammate with that id in your clinic" });
  }

  if (body.role && !allowedRoles.includes(body.role as AppRole)) {
    return json(403, { error: `Your role cannot set someone to ${body.role}` });
  }

  if (await isRateLimited(admin, callerId, "edit", MAX_EDITS_PER_HOUR)) {
    return json(429, { error: "Too many changes made. Try again in a bit." });
  }

  if (body.deactivate) {
    const { error: banErr } = await admin.auth.admin.updateUserById(body.target_user_id, {
      // Effectively permanent (~100 years) - Supabase bans are duration-based,
      // not a boolean flag. This is deliberately done at the auth layer
      // (banning) rather than a new profiles.active column: a banned user
      // can never mint a session to present a JWT at all, so every existing
      // RLS policy and every auth_role()/auth_is_staff() call site stays
      // correct with no changes anywhere else. Known gap, not solved here:
      // if this person was someone else's supervisor_id, those rows are
      // left pointing at a now-banned account - the response below flags
      // it, nothing auto-reassigns.
      ban_duration: "876000h",
    });
    if (banErr) return json(500, { error: banErr.message });

    const { count: reportsCount } = await admin
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("supervisor_id", body.target_user_id);

    await recordAudit(admin, {
      actor_id: callerId,
      actor_clinic_id: caller.clinic_id,
      action: "deactivate",
      target_user_id: body.target_user_id,
      target_clinic_id: caller.clinic_id,
    });

    return json(200, {
      ok: true,
      warning: reportsCount ? `${reportsCount} teammate(s) still list this person as their supervisor` : undefined,
    });
  }

  let supervisorId: string | null | undefined = undefined;
  if (body.supervisor_id !== undefined) {
    if (body.supervisor_id === null) {
      supervisorId = null;
    } else {
      const { data: sup } = await admin
        .from("profiles")
        .select("id, clinic_id")
        .eq("id", body.supervisor_id)
        .maybeSingle();
      if (!sup || sup.clinic_id !== caller.clinic_id) {
        return json(400, { error: "supervisor_id must be a teammate in your own clinic" });
      }
      supervisorId = sup.id;
    }
  }

  const patch: Record<string, unknown> = {};
  if (body.role) patch.role = body.role;
  if (supervisorId !== undefined) patch.supervisor_id = supervisorId;
  if (body.full_name !== undefined) patch.full_name = body.full_name;

  if (Object.keys(patch).length === 0) return json(400, { error: "Nothing to change" });

  const { error: updateErr } = await admin.from("profiles").update(patch).eq("id", body.target_user_id);
  if (updateErr) return json(500, { error: updateErr.message });

  await recordAudit(admin, {
    actor_id: callerId,
    actor_clinic_id: caller.clinic_id,
    action: "edit",
    target_user_id: body.target_user_id,
    target_clinic_id: caller.clinic_id,
    detail: patch,
  });

  return json(200, { ok: true });
});
