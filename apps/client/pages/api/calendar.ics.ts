import type { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "../../lib/supabase-server";
import { resolveViewedClient } from "../../lib/admin-view-as";
import { clinicTodayDateStr } from "../../lib/clinic-date";
import { explainAccountProblem } from "../../lib/explain-account-problem";
import { readDefaultSessionDurationMinutes, DEFAULT_SESSION_DURATION_MINUTES } from "../../lib/org-settings";
import { buildAppointmentsIcs, type IcsSession } from "../../lib/ics";

/**
 * Downloadable .ics export of the viewed client's upcoming appointments -
 * linked from pages/appointments.tsx. A one-time, cookie-authenticated
 * download: relies on the same session cookie every other page in this app
 * already trusts, which only works while the browser downloading it is
 * signed in.
 *
 * Not a subscribable webcal:// feed - a calendar app polling on its own
 * can't send that cookie. See pages/api/calendar/feed/[token].ics.ts for
 * that (a separate, unauthenticated-but-token-gated route, migration 0044)
 * rather than this one growing a second trust model.
 *
 * Text responses, not JSX - this is a file download, not a page, so it
 * doesn't render AccountProblemNotice/LoadErrorNotice; each resolveViewedClient
 * outcome gets its own plain-text response with an appropriate status
 * instead.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.status(405).send("GET only");
    return;
  }

  const supabase = createClient(req, res);

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    res.status(401).send("Not signed in.");
    return;
  }

  const resolved = await resolveViewedClient(supabase, req, user.id);

  if (resolved.kind === "error") {
    res.status(500).send("Something went wrong loading your account. Try again shortly.");
    return;
  }
  if (resolved.kind === "needs-selection") {
    res.status(400).send("Select a family to view as before downloading a calendar.");
    return;
  }
  if (resolved.kind === "account-problem") {
    const { title, detail } = explainAccountProblem(resolved.problem);
    res.status(404).send(`${title}. ${detail}`);
    return;
  }
  if (resolved.kind === "not-permitted") {
    res.status(403).send("Not permitted.");
    return;
  }

  const { viewed } = resolved;

  // Same scoping as pages/index.tsx's "Upcoming Sessions" query (today
  // forward, non-cancelled) - a calendar export of past or cancelled
  // sessions isn't useful to import. No .limit() though: unlike the
  // dashboard snapshot, the whole point here is every upcoming
  // appointment, not a preview.
  const { data: sessions, error: sessionsError } = await supabase
    .from("sessions")
    .select("id, session_date, hour, minute, type, status")
    .eq("client_id", viewed.clientId)
    .gte("session_date", clinicTodayDateStr())
    .neq("status", "cancelled")
    .order("session_date", { ascending: true })
    .order("hour", { ascending: true })
    .order("minute", { ascending: true });

  if (sessionsError) {
    console.error("calendar.ics: failed to load sessions:", sessionsError.message);
    res.status(500).send("Couldn't load your appointments. Try again shortly.");
    return;
  }

  // resolveViewedClient() already looked this up internally (for both the
  // real-client and admin-view-as branches) but doesn't expose it on
  // ViewedClient - a second small lookup, same as
  // pages/api/sessions/request-change.ts does for the same reason.
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("clinic_id")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError || !profile?.clinic_id) {
    console.error(
      "calendar.ics: could not resolve clinic_id for session duration:",
      profileError?.message ?? "no clinic_id on profile"
    );
  }
  const durationMinutes = profile?.clinic_id
    ? await readDefaultSessionDurationMinutes(supabase, profile.clinic_id)
    : DEFAULT_SESSION_DURATION_MINUTES;

  const ics = buildAppointmentsIcs(
    (sessions ?? []) as IcsSession[],
    viewed.clientName,
    durationMinutes
  );

  res.setHeader("Content-Type", "text/calendar; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="summit-appointments.ics"');
  res.status(200).send(ics);
}
