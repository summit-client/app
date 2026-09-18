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
  // hr_admin and payroll_admin added 2026-09-18, matching INVITE_MATRIX:
  // a role you can issue but never change is half a role.
  admin: ["admin", "supervisor", "clinician", "scheduler", "client", "hr_admin", "payroll_admin"],
  scheduler: ["client", "clinician"],
};

/**
 * Which roles a caller may act ON, by the target's CURRENT role. This is a
 * separate question from EDIT_INTO_MATRIX above, and leaving it unasked was
 * a privilege-escalation hole: the matrix gated only the role being SET, so
 * a scheduler - who may set client/clinician - could point this at their own
 * clinic's admin and set role "clinician", demoting them. The deactivate
 * branch asked neither question and would ban that admin outright.
 *
 * "any" rather than a list for admin on purpose. It was written that way
 * because profiles.role carried hr_admin and payroll_admin while this
 * function's AppRole union did not, and a literal list would have silently
 * stopped admins managing those accounts. The union knows them now, but
 * "any" stays: it is the honest expression of "an admin may act on anyone in
 * their clinic", and it cannot go stale the next time a role is added.
 * A scheduler stays pinned to the same two roles it may invite and set.
 */
const EDIT_TARGETS_MATRIX: Partial<Record<AppRole, readonly AppRole[] | "any">> = {
  admin: "any",
  scheduler: ["client", "clinician"],
};

const MAX_EDITS_PER_HOUR = 30;

interface EditRequest {
  target_user_id?: string;
  role?: string;
  supervisor_id?: string | null;
  full_name?: string;
  deactivate?: boolean;
  /** Who inherits the target's supervisees. `null` clears the link
   *  deliberately; omitted means the caller has not answered, and a target
   *  who supervises anyone is refused with 409 until they do. */
  reassign_supervisees_to?: string | null;
  /** Lift a ban. The inverse of `deactivate`, and gated identically. */
  reactivate?: boolean;
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
  const editableTargets = EDIT_TARGETS_MATRIX[caller.role];
  if (!allowedRoles || !editableTargets) return json(403, { error: "Your role cannot edit teammates" });

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

  // Before anything else this request might do - set a role, rename, reassign
  // a supervisor, or ban outright - can the caller touch THIS person at all?
  // Same clinic is not enough on its own; that check only stops cross-tenant
  // edits, never a lower-privileged role reaching up within its own clinic.
  if (editableTargets !== "any" && !editableTargets.includes(target.role)) {
    return json(403, { error: `Your role cannot change a ${target.role} account` });
  }

  if (body.role && !allowedRoles.includes(body.role as AppRole)) {
    return json(403, { error: `Your role cannot set someone to ${body.role}` });
  }

  if (await isRateLimited(admin, callerId, "edit", MAX_EDITS_PER_HOUR)) {
    return json(429, { error: "Too many changes made. Try again in a bit." });
  }

  if (body.reactivate) {
    // The inverse of the ban above. It had no endpoint at all, so undoing a
    // mistaken deactivation meant the Supabase dashboard - which is a poor
    // place to keep the only copy of a routine operation.
    //
    // Gated by the same two matrices as everything else here: the caller
    // must be allowed to act on this target's current role. Supervisees are
    // NOT restored, because they were reassigned to a real person on the way
    // out and silently taking them back would undo a deliberate choice.
    const { error: unbanErr } = await admin.auth.admin.updateUserById(body.target_user_id, {
      ban_duration: "none",
    });
    if (unbanErr) return json(500, { error: unbanErr.message });

    await recordAudit(admin, {
      actor_id: callerId,
      actor_clinic_id: caller.clinic_id,
      action: "reactivate",
      target_user_id: body.target_user_id,
      target_clinic_id: caller.clinic_id,
    });

    return json(200, { ok: true });
  }

  if (body.deactivate) {
    // Supervisees are moved BEFORE the ban, not counted after it.
    //
    // This used to ban first and then report a count, which is the wrong
    // order twice over: the caller learned about the orphans only once they
    // were already orphaned, and nothing reassigned them, so the rows sat
    // pointing at an account that can no longer hold a session. Everything
    // keyed on supervisor_id - hub_can_manage()'s team branch,
    // auth_may_read_hr_of(), timesheet approval, the console's own queue
    // scoping - then silently matched nobody.
    //
    // Doing it first also means a failed reassignment leaves the person
    // active rather than banned with their team in limbo.
    const { data: supervisees, error: superviseeErr } = await admin
      .from("profiles")
      .select("id")
      .eq("supervisor_id", body.target_user_id);
    if (superviseeErr) return json(500, { error: superviseeErr.message });

    const reportsCount = supervisees?.length ?? 0;
    if (reportsCount > 0) {
      // `null` is a real answer, not a missing one: "these people have no
      // supervisor for now" is often the truth on a departure, and the
      // console offers it explicitly. `undefined` would mean the caller
      // never addressed the question, which the guard below rejects.
      if (body.reassign_supervisees_to === undefined) {
        return json(409, {
          error: `${reportsCount} teammate(s) list this person as their supervisor. Choose who takes them on, or clear it, before deactivating.`,
          supervisee_count: reportsCount,
        });
      }
      const newSupervisor = body.reassign_supervisees_to;
      if (newSupervisor !== null) {
        if (newSupervisor === body.target_user_id) {
          return json(400, { error: "Supervisees cannot be reassigned to the person being deactivated." });
        }
        const { data: replacement, error: replacementErr } = await admin
          .from("profiles")
          .select("id, clinic_id")
          .eq("id", newSupervisor)
          .maybeSingle();
        if (replacementErr) return json(500, { error: replacementErr.message });
        if (!replacement || replacement.clinic_id !== caller.clinic_id) {
          return json(403, { error: "That supervisor is not in your clinic." });
        }
      }
      const { error: moveErr } = await admin
        .from("profiles")
        .update({ supervisor_id: newSupervisor })
        .eq("supervisor_id", body.target_user_id);
      if (moveErr) return json(500, { error: `Could not move this person's team: ${moveErr.message}` });
    }

    const { error: banErr } = await admin.auth.admin.updateUserById(body.target_user_id, {
      // Effectively permanent (~100 years) - Supabase bans are duration-based,
      // not a boolean flag. This is deliberately done at the auth layer
      // (banning) rather than a new profiles.active column: a banned user
      // can never mint a session to present a JWT at all, so every existing
      // RLS policy and every auth_role()/auth_is_staff() call site stays
      // correct with no changes anywhere else.
      ban_duration: "876000h",
    });
    if (banErr) return json(500, { error: banErr.message });

    await recordAudit(admin, {
      actor_id: callerId,
      actor_clinic_id: caller.clinic_id,
      action: "deactivate",
      target_user_id: body.target_user_id,
      target_clinic_id: caller.clinic_id,
    });

    return json(200, {
      ok: true,
      reassigned: reportsCount,
      warning: reportsCount
        ? (body.reassign_supervisees_to === null
            ? `${reportsCount} teammate(s) now have no supervisor.`
            : `${reportsCount} teammate(s) moved to their new supervisor.`)
        : undefined,
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
