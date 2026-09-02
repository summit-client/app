import type { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "../../../lib/supabase-server";

/**
 * Record something the family noticed.
 *
 * Deliberately not filed as clinical data. `family_observations` (migration
 * 0043) is a separate table from session notes and programs, so a parent's
 * account of a hard week at school is never mistaken for a clinician's
 * measurement — and so the clinical record cannot be written by anyone
 * outside the clinical team.
 *
 * clinician_status starts at 'new' and only the clinic moves it. The portal
 * does not claim a clinician has read something; it records that the family
 * said it.
 */
const KINDS = [
  "home_win", "concern", "school_update",
  "health_update", "behaviour_observation", "general",
];

const MAX_BODY = 4000;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ error: "POST only" });
    return;
  }

  const supabase = createClient(req, res);
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    res.status(401).json({ error: "Not signed in." });
    return;
  }

  const { data: profile } = await supabase
    .from("profiles").select("role, clinic_id").eq("id", user.id).maybeSingle();
  if (profile?.role !== "client") {
    res.status(403).json({
      error: "Notes from the family are written from the family's own account.",
    });
    return;
  }
  if (!profile.clinic_id) {
    res.status(500).json({ error: "Couldn't resolve your clinic. Try again." });
    return;
  }

  const clientId = Number(req.body?.clientId);
  const kind = typeof req.body?.kind === "string" ? req.body.kind : "general";
  const body = typeof req.body?.body === "string" ? req.body.body.trim() : "";
  const occurredOn = typeof req.body?.occurredOn === "string" ? req.body.occurredOn : "";

  if (!Number.isFinite(clientId)) {
    res.status(400).json({ error: "Who is this about?" });
    return;
  }
  if (!body) {
    res.status(400).json({ error: "Write something before saving." });
    return;
  }
  if (body.length > MAX_BODY) {
    res.status(400).json({
      error: `That is ${body.length - MAX_BODY} characters over the limit.`,
    });
    return;
  }
  // An unrecognized kind becomes 'general' rather than reaching a check
  // constraint, which would surface as a 500 for a stale page.
  const safeKind = KINDS.includes(kind) ? kind : "general";

  // A date the family chose, but never one in the future: an observation is an
  // account of something that happened.
  const today = new Date().toISOString().slice(0, 10);
  const date =
    /^\d{4}-\d{2}-\d{2}$/.test(occurredOn) && occurredOn <= today ? occurredOn : today;

  const { error } = await supabase.from("family_observations").insert({
    clinic_id: profile.clinic_id,
    client_id: clientId,
    author_user_id: user.id,
    kind: safeKind,
    body,
    occurred_on: date,
  });

  if (error) {
    console.error("family/observation: insert failed:", error.message);
    // RLS refuses a child this guardian may not write about, or one they lack
    // message_clinic for. Both come back the same way.
    res.status(500).json({ error: "That was not saved. Try again shortly." });
    return;
  }

  res.status(200).json({ ok: true });
}
