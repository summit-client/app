import type { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "../../../lib/supabase-server";

/**
 * Withdraw a consent.
 *
 * An update, not a delete, and the only update a family may make to a consent
 * record. The trigger in migration 0048 refuses anything that touches the
 * grant, so this cannot rewrite when or by whom consent was given — it can
 * only close the window.
 *
 * Withdrawal is deliberately not gated behind a confirmation the API enforces.
 * A family who wants to stop something should not have to get past this route
 * to do it; the page asks once, and this records it.
 */
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
    .from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profile?.role !== "client") {
    res.status(403).json({
      error: "Consent can only be withdrawn from the family's own account.",
    });
    return;
  }

  const consentId = typeof req.body?.consentId === "string" ? req.body.consentId : "";
  const reason = typeof req.body?.reason === "string" ? req.body.reason.trim().slice(0, 500) : "";
  if (!consentId) {
    res.status(400).json({ error: "Which consent?" });
    return;
  }

  const { data: updated, error } = await supabase
    .from("consent_records")
    .update({
      withdrawn_at: new Date().toISOString(),
      withdrawn_by: user.id,
      withdrawal_reason: reason || null,
    })
    .eq("id", consentId)
    // Only a live one. Without this, withdrawing an already-withdrawn consent
    // would move its withdrawal date, quietly changing the window the clinic
    // was entitled to act in.
    .is("withdrawn_at", null)
    .select("id");

  if (error) {
    console.error("forms/withdraw-consent: update failed:", error.message);
    res.status(500).json({ error: "Your withdrawal was not recorded. Try again shortly." });
    return;
  }

  // An RLS-filtered update matches nothing and raises nothing, so an empty
  // result is the only signal that this consent was not the caller's, or was
  // already withdrawn. Same answer for both, on purpose.
  if (!updated || updated.length === 0) {
    res.status(404).json({ error: "That consent is not available to withdraw." });
    return;
  }

  res.status(200).json({ ok: true });
}
