import type { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "../../../lib/supabase-server";
import { resolveViewedClient } from "../../../lib/admin-view-as";
import type { Activity, ActivityStatus } from "../../../lib/activity-display";

const CLIENT_SETTABLE_STATUSES: ActivityStatus[] = ["in_progress", "completed"];

/**
 * Marks one home-program activity in_progress/completed for the signed-in
 * family's own child. This is the first mutation apps/client has ever had
 * (see lib/admin-view-as.ts's header, updated alongside this) - everything
 * else in this app is a GetServerSideProps read.
 *
 * The activityId is untrusted input, same as pages/api/admin/view-as.ts's
 * clientId - re-resolves the caller's own viewed client from their session
 * rather than trusting anything the request body says about who they are.
 * Migration 0035's RLS (home_program_activities_client_update, scoped to
 * `client_id = auth_client_row_id()`) is the real boundary; the .eq below
 * is defense-in-depth on top of it, matching every other query in this app.
 *
 * Admin "view as" stays explicitly read-only (lib/admin-view-as.ts's
 * long-standing design) - checked here up front rather than left to RLS to
 * discover, so a family's real record is never even attempted. RLS would
 * refuse it anyway (auth_role() for an admin account is 'admin', not
 * 'client', so home_program_activities_client_update's USING clause never
 * matches), but that would surface as an opaque "not found", not a clear
 * "admin view is read-only" - the same "say something" principle
 * CLAUDE.md's RLS-returns-empty-sets trap already calls out.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.status(405).end();
    return;
  }

  const activityId = typeof req.body?.activityId === "string" ? req.body.activityId : "";
  const rawStatus = typeof req.body?.status === "string" ? req.body.status : "";

  if (!activityId) {
    res.status(400).send("Missing activityId");
    return;
  }
  if (!CLIENT_SETTABLE_STATUSES.includes(rawStatus as ActivityStatus)) {
    res.status(400).send("Status must be in_progress or completed");
    return;
  }
  const status = rawStatus as ActivityStatus;

  const supabase = createClient(req, res);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    res.status(401).send("Not signed in");
    return;
  }

  const resolved = await resolveViewedClient(supabase, req, user.id);

  if (resolved.kind !== "viewing") {
    res.status(403).send("Not permitted");
    return;
  }
  if (resolved.viewed.isAdminViewingAs) {
    res.status(403).send("Admin view is read-only");
    return;
  }

  const { data: activity, error } = await supabase
    .from("home_program_activities")
    .update({ status })
    .eq("id", activityId)
    .eq("client_id", resolved.viewed.clientId)
    .select("id, title, description, status, created_at, completed_at, goal_id")
    .maybeSingle();

  if (error) {
    console.error("Failed to update home-program activity:", error.message);
    res.status(500).send("Couldn't update that activity");
    return;
  }
  if (!activity) {
    res.status(404).send("Activity not found");
    return;
  }

  res.status(200).json({ activity: activity as Activity });
}
