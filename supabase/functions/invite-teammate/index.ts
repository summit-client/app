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
  // hr_admin and payroll_admin added 2026-09-18. An admin could not create
  // one of these accounts from anywhere in the product, so the permissions
  // migration 0024 seeded them were unreachable. Only admin may issue them:
  // both roles read HR or payroll records clinic-wide, which is not a
  // scheduler's to hand out.
  admin: ["admin", "supervisor", "clinician", "scheduler", "client", "hr_admin", "payroll_admin"],
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
   * When role === "client", exactly one of client_id or the inline intake
   * fields below is expected. client_id attaches an EXISTING scheduler
   * `clients` row (created earlier through normal intake, e.g. via
   * apps/scheduler's own "add client" form - unchanged, still the only path
   * for creating a client record ahead of anyone being invited to it).
   */
  client_id?: number;
  /**
   * Inline client intake, used only when role === "client" and client_id is
   * omitted - creates a brand-new `clients` row and links this invite's
   * login to it in the same call, rather than requiring the two-step
   * "create the record, then separately invite" flow. Same shape and same
   * defaults as apps/scheduler's own handleCreateClient(), so a client
   * created either way ends up identical. full_name (already collected
   * above) is this client's name; only session_type is otherwise required.
   */
  session_type?: string;
  status?: string;
  address?: string;
  contact_phone?: string;
  contact_email?: string;
  referral_source?: string;
}

/** Mon-Sat, blank (start_time/end_time null) - the same placeholder shape
 *  apps/scheduler's handleCreateStaff()/handleCreateClient() seed immediately
 *  after creating either row, so a resource created via invite ends up in
 *  the identical state as one created there. */
const BLANK_AVAILABILITY_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

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

  // Reject up front if this email already belongs to a real, established
  // account. inviteUserByEmail resolves an already-registered email to
  // that SAME EXISTING auth.users id rather than erroring or minting a new
  // one, and the upsert below writes straight over whatever profile that
  // id already has - silently reassigning someone else's role/clinic/
  // supervisor (confirmed live 2026-08-30, see CLAUDE.md's "Known open
  // work" / docs/context/decisions.md).
  //
  // Checked here, before inviteUserByEmail is ever called, for two
  // reasons: it avoids sending a real invite email for a request we're
  // about to reject, and it's what lets this safely tell a genuine
  // pre-existing account apart from the database trigger that creates a
  // default profiles row (role 'client', clinic_id null) the instant ANY
  // auth.users row is created, including by inviteUserByEmail itself.
  // Because this query runs strictly before that call, any row it finds
  // here necessarily predates - and cannot be - this invite's own
  // trigger race. (A genuinely new email always passes this check, then
  // races the trigger exactly as it does today; that path is unchanged.)
  const { data: existingProfile, error: existingProfileErr } = await admin
    .from("profiles")
    .select("id, clinic_id")
    .eq("email", email)
    .maybeSingle();
  if (existingProfileErr) {
    return json(500, { error: "Could not check for an existing account: " + existingProfileErr.message });
  }
  if (existingProfile) {
    return json(409, {
      error:
        existingProfile.clinic_id === caller.clinic_id
          ? "An account with this email already exists in your clinic."
          : "An account with this email already exists under another clinic.",
    });
  }

  let linkedClientId: number | null = null;
  const creatingClientInline = role === "client" && body.client_id == null;
  if (role === "client" && !creatingClientInline) {
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
  if (creatingClientInline && !body.full_name?.trim()) {
    return json(400, { error: "A name is required to create a new client record" });
  }
  if (creatingClientInline && !body.session_type?.trim()) {
    return json(400, { error: "A session type is required to create a new client record" });
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

  // Passed through as .Data in the invite email template (supabase/templates/
  // invite.html) so the email can greet the person by name and say what
  // they're being invited to, instead of the generic default. Template
  // guards every field with an `if`, so this stays optional - it degrades to
  // the generic copy if either is ever blank.
  const { data: invited, error: inviteErr } = await admin.auth.admin.inviteUserByEmail(email, {
    data: { full_name: body.full_name?.trim() || null, role },
  });
  if (inviteErr || !invited?.user) {
    return json(500, { error: inviteErr?.message ?? "Could not send invite" });
  }
  const newUserId = invited.user.id;

  let createdClientId: number | null = null;

  if (role === "client" && linkedClientId != null) {
    // A database trigger already created a default profiles row (role
    // 'client', clinic_id null) the instant inviteUserByEmail ran - which
    // happens to be exactly the shape a self-signed-up client's profile
    // already has, so nothing further to write here. Only linking the
    // clients record is this branch's job.
    const { error: linkErr } = await admin.from("clients").update({ user_id: newUserId }).eq("id", linkedClientId);
    if (linkErr) return json(500, { error: "Invite sent, but linking the client record failed: " + linkErr.message });
  } else if (role === "client" && creatingClientInline) {
    // Same insert shape as apps/scheduler's handleCreateClient(), plus
    // user_id set immediately (that form updates it in a second step since
    // it has no new login yet at that point; this call already does).
    const { data: newClient, error: clientInsertErr } = await admin
      .from("clients")
      .insert({
        name: body.full_name!.trim(),
        email: invited.user.email,
        session_type: body.session_type!.trim(),
        status: body.status?.trim() || "active",
        address: body.address?.trim() || null,
        contact_phone: body.contact_phone?.trim() || null,
        contact_email: body.contact_email?.trim() || null,
        referral_source: body.referral_source?.trim() || null,
        sessions: 0,
        availability: [],
        clinic_id: caller.clinic_id,
        user_id: newUserId,
      })
      .select("id")
      .single();
    if (clientInsertErr || !newClient) {
      return json(500, { error: "Invite sent, but creating the client record failed: " + (clientInsertErr?.message ?? "unknown error") });
    }
    createdClientId = newClient.id as number;
    const { error: availErr } = await admin.from("client_availability").insert(
      BLANK_AVAILABILITY_DAYS.map((day) => ({
        client_id: createdClientId, day, start_time: null, end_time: null, clinic_id: caller.clinic_id,
      })),
    );
    if (availErr) return json(500, { error: "Invite sent and client created, but seeding availability failed: " + availErr.message });
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

    // Staff-shaped roles only, past this point (client is handled above).
    // A brand-new `staff` row, user_id set to this same new login - never a
    // match against a pre-existing row (see migration 0075's header for why
    // that distinction is what makes this safe to automate at all), plus
    // the employment_records row that used to be a separate manual step
    // (an admin, later, via the Workforce screen). Mostly the same insert
    // shape as apps/scheduler's handleCreateStaff() for the staff row
    // itself - minus `booked: 0`, which that function sends but which is
    // not a real column anywhere in the tracked schema (0000's
    // reconstruction of `staff` has no `booked` column, nothing later adds
    // one, and that reconstruction's own header already admits it's
    // "unverified against a production dump"). Worth a human checking
    // whether handleCreateStaff's insert is quietly failing on that field
    // today - not fixed here, out of this change's scope, but not worth
    // copying into new code either. `capacity`/`specialties`/`availability`
    // stay blank the same way that form leaves them, for an admin to fill
    // in later.
    const { data: newStaff, error: staffInsertErr } = await admin
      .from("staff")
      .insert({
        name: body.full_name?.trim() || email,
        role: null,
        specialties: [],
        capacity: 0,
        availability: [],
        clinic_id: caller.clinic_id,
        user_id: newUserId,
      })
      .select("id")
      .single();
    if (staffInsertErr || !newStaff) {
      return json(500, { error: "Invite sent, but creating the staff record failed: " + (staffInsertErr?.message ?? "unknown error") });
    }
    const newStaffId = newStaff.id as number;

    const { error: staffAvailErr } = await admin.from("staff_availability").insert(
      BLANK_AVAILABILITY_DAYS.map((day) => ({
        staff_id: newStaffId, day, start_time: null, end_time: null, clinic_id: caller.clinic_id,
      })),
    );
    if (staffAvailErr) return json(500, { error: "Invite sent and staff record created, but seeding availability failed: " + staffAvailErr.message });

    const { error: employmentErr } = await admin.from("employment_records").insert({
      clinic_id: caller.clinic_id,
      user_id: newUserId,
      staff_id: newStaffId,
      start_date: new Date().toISOString().slice(0, 10),
    });
    if (employmentErr) {
      return json(500, { error: "Invite sent and staff record created, but creating the employment record failed: " + employmentErr.message });
    }
  }

  await recordAudit(admin, {
    actor_id: callerId,
    actor_clinic_id: caller.clinic_id,
    action: "invite",
    target_user_id: newUserId,
    target_clinic_id: caller.clinic_id,
    detail: { email, role, client_id: linkedClientId ?? createdClientId, supervisor_id: supervisorId },
  });

  return json(200, { ok: true, user_id: newUserId });
});
