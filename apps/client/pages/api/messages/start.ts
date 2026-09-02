import type { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "../../../lib/supabase-server";
import {
  CATEGORY_OPTIONS, messageProblem, subjectProblem, type ThreadCategory,
} from "../../../lib/messages";

/**
 * Sending is never possible from an admin's "view as" session.
 *
 * Carried over from the messaging route this one replaces. RLS is already the
 * real boundary — a family message insert requires a guardian relationship on
 * the thread, which an admin does not have, so the database refuses it. This
 * check exists so the refusal is a clear 403 rather than an RLS-shaped 500,
 * and so the rule is stated where someone editing the route will read it: an
 * admin who wants to write to a family writes as themselves, from the staff
 * side, under their own name.
 */
async function refuseIfNotFamily(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  res: NextApiResponse,
): Promise<boolean> {
  const { data: profile, error } = await supabase
    .from("profiles").select("role").eq("id", userId).maybeSingle();
  if (error) {
    console.error("messages: profile lookup failed:", error.message);
    res.status(500).json({ error: "Could not verify your account." });
    return true;
  }
  if (profile?.role !== "client") {
    res.status(403).json({
      error: "Staff accounts send from the clinic side, under their own name.",
    });
    return true;
  }
  return false;
}

/**
 * Start a new conversation, and post its first message.
 *
 * Two inserts, and no transaction available over PostgREST — so if the second
 * fails, the thread is deleted rather than left as an empty conversation the
 * family can see and the clinic cannot answer. The delete runs under the
 * caller's own session and will simply do nothing if RLS refuses it, which is
 * why the response still reports the failure honestly rather than claiming a
 * clean rollback.
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

  if (await refuseIfNotFamily(supabase, user.id, res)) return;

  const subject = typeof req.body?.subject === "string" ? req.body.subject : "";
  const body = typeof req.body?.body === "string" ? req.body.body : "";
  const rawCategory = typeof req.body?.category === "string" ? req.body.category : "general";
  // `clientId` absent or null means the thread is about the household.
  const rawClientId = req.body?.clientId;

  const subjectIssue = subjectProblem(subject);
  if (subjectIssue) { res.status(400).json({ error: subjectIssue }); return; }
  const bodyIssue = messageProblem(body);
  if (bodyIssue) { res.status(400).json({ error: bodyIssue }); return; }

  // An unrecognized category becomes "other" rather than being passed through
  // to a check constraint, which would surface as a 500 for what is really a
  // stale browser sending a value this build no longer offers.
  const category: ThreadCategory =
    CATEGORY_OPTIONS.some((o) => o.value === rawCategory)
      ? (rawCategory as ThreadCategory) : "other";

  const clientId =
    rawClientId === null || rawClientId === undefined || rawClientId === ""
      ? null : Number(rawClientId);
  if (clientId !== null && !Number.isFinite(clientId)) {
    res.status(400).json({ error: "Who is this about?" });
    return;
  }

  // The household and clinic come from the caller's own family record, never
  // from the request. `my_family` is already scoped to this guardian.
  const { data: family, error: familyError } = await supabase
    .from("my_family")
    .select("client_id, household_id, clinic_id")
    .limit(200);

  if (familyError) {
    console.error("messages/start: family lookup failed:", familyError.message);
    res.status(500).json({ error: "Something went wrong. Try again shortly." });
    return;
  }
  const rows = family ?? [];
  if (rows.length === 0) {
    res.status(403).json({ error: "Your account is not linked to a family record yet." });
    return;
  }

  if (clientId !== null && !rows.some((r) => Number(r.client_id) === clientId)) {
    res.status(404).json({ error: "That is not someone on your family record." });
    return;
  }

  const scope = clientId === null
    // For a household thread, any row will do — every child a guardian reaches
    // through one household carries the same household_id. Prefer one that
    // actually has a household over one that does not.
    ? (rows.find((r) => r.household_id) ?? rows[0])
    : rows.find((r) => Number(r.client_id) === clientId)!;

  // `my_family.household_id` comes from a left join, so it is null for a client
  // who was never placed in a household. That is a data-setup gap rather than a
  // permission problem, and it needs to say so: the alternative is a 500 from a
  // not-null violation that reads like a bug in the portal.
  if (!scope.household_id) {
    res.status(409).json({
      error: "Your family record is still being set up. Call the clinic and they can finish it.",
    });
    return;
  }

  const { data: thread, error: threadError } = await supabase
    .from("message_threads")
    .insert({
      clinic_id: scope.clinic_id,
      household_id: scope.household_id,
      client_id: clientId,
      subject: subject.trim(),
      category,
      started_by: user.id,
      // Not accepted from the request. Priority is the clinic's triage signal;
      // the insert policy refuses anything but 'normal' from a family anyway.
      priority: "normal",
    })
    .select("id")
    .single();

  if (threadError || !thread) {
    console.error("messages/start: thread insert failed:", threadError?.message);
    res.status(500).json({ error: "The conversation was not started. Try again shortly." });
    return;
  }

  const { error: messageError } = await supabase.from("messages").insert({
    clinic_id: scope.clinic_id,
    thread_id: thread.id,
    author_user_id: user.id,
    author_kind: "family",
    body: body.trim(),
    visibility: "shared",
  });

  if (messageError) {
    console.error("messages/start: first message failed:", messageError.message);
    // An empty thread is worse than no thread: it appears in the family's
    // inbox and in the clinic's queue with nothing in it to answer.
    await supabase.from("message_threads").delete().eq("id", thread.id);
    res.status(500).json({ error: "Your message was not sent. Try again shortly." });
    return;
  }

  res.status(200).json({ ok: true, threadId: thread.id });
}
