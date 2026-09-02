import type { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "../../../lib/supabase-server";
import { resolveViewedClient } from "../../../lib/admin-view-as";

/**
 * Files a request for staff to reschedule or cancel one of the signed-in
 * family's own upcoming sessions - pages/appointments.tsx's "Request
 * reschedule" / "Request cancellation" actions. This never touches
 * `sessions` itself: it only inserts a row into `session_change_requests`
 * (migration 0035, not yet applied to the live database - see that file's
 * own header) for staff to see and action from their own side. There is no
 * staff-side UI for that queue yet either; this endpoint only has to get the
 * ask recorded.
 *
 * Re-checks everything itself rather than trusting the page that called it,
 * matching every other apps/client API route (see pages/api/admin/view-as.ts)
 * - the request body is untrusted input regardless of which screen sent it.
 */

const MAX_NOTE_LENGTH = 1000;
const REQUEST_TYPES = new Set(["reschedule", "cancel"]);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "POST only" });
    return;
  }

  const sessionId = Number(req.body?.sessionId);
  const requestType = req.body?.requestType;
  const note = typeof req.body?.note === "string" ? req.body.note.trim() : "";

  if (!Number.isInteger(sessionId) || sessionId <= 0) {
    res.status(400).json({ error: "Missing or invalid sessionId" });
    return;
  }
  if (typeof requestType !== "string" || !REQUEST_TYPES.has(requestType)) {
    res.status(400).json({ error: "requestType must be 'reschedule' or 'cancel'" });
    return;
  }
  if (note.length > MAX_NOTE_LENGTH) {
    res.status(400).json({ error: `Note must be ${MAX_NOTE_LENGTH} characters or fewer` });
    return;
  }

  const supabase = createClient(req, res);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    res.status(401).json({ error: "Not signed in" });
    return;
  }

  const resolved = await resolveViewedClient(supabase, req, user.id);

  if (resolved.kind !== "viewing") {
    res.status(403).json({ error: "Not permitted" });
    return;
  }

  // Admin "view as" is read-only by design (see lib/admin-view-as.ts's own
  // header comment: this app has never had a mutation before this one). An
  // admin simulating a family's view must never be able to file a request
  // that family never asked for. The session_change_requests_client_insert
  // RLS policy would already refuse this (auth_role() is 'admin' here, not
  // 'client'), but that would surface as an opaque row-level-security error
  // - rejected explicitly instead, with copy that says why.
  if (resolved.viewed.isAdminViewingAs) {
    res.status(403).json({
      error:
        "Reschedule and cancellation requests can only be submitted from the family's own account.",
    });
    return;
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("clinic_id")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError || !profile?.clinic_id) {
    console.error(
      "request-change: could not resolve clinic_id:",
      profileError?.message ?? "no clinic_id on profile"
    );
    res.status(500).json({ error: "Couldn't resolve your clinic. Try again." });
    return;
  }

  // The child is read off the session, not off whichever child the portal
  // happens to be pointed at. Since the calendar became family-wide, a parent
  // can act on a sibling's session without switching first - and pinning
  // client_id to the resolved view would then name the wrong child. RLS would
  // catch it (the insert policy re-checks that the session belongs to the
  // named client) but only as an opaque row-level-security failure on a
  // request the parent was entitled to make.
  //
  // Read through the caller's own session, so RLS decides whether this session
  // exists for them at all. A session they cannot see comes back as "not
  // found" rather than "forbidden": the difference between those two answers
  // would confirm that someone else's session id is real.
  const { data: session, error: sessionError } = await supabase
    .from("sessions")
    .select("id, client_id")
    .eq("id", sessionId)
    .maybeSingle();

  if (sessionError) {
    console.error("request-change: session lookup failed:", sessionError.message);
    res.status(500).json({ error: "Couldn't submit your request. Try again." });
    return;
  }
  if (!session) {
    res.status(404).json({ error: "That appointment is not available." });
    return;
  }

  // RLS (session_change_requests_family_insert, migration 0053) independently
  // re-checks that this session belongs to this client and clinic, and that
  // the caller holds manage_appointments for that child - seeing a sibling's
  // calendar is not the same as being allowed to move it.
  const { data: request, error: insertError } = await supabase
    .from("session_change_requests")
    .insert({
      clinic_id: profile.clinic_id,
      client_id: session.client_id,
      session_id: sessionId,
      request_type: requestType,
      note: note || null,
      created_by: user.id,
    })
    .select("id, session_id, request_type, status, created_at")
    .single();

  if (insertError) {
    console.error("Failed to create session change request:", insertError.message);
    res.status(500).json({ error: "Couldn't submit your request. Try again." });
    return;
  }

  res.status(201).json({ request });
}
