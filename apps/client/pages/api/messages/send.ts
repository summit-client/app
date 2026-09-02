import type { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "../../../lib/supabase-server";
import { messageProblem } from "../../../lib/messages";

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
 * Post a reply into an existing thread.
 *
 * Why this is a route and not a `supabase.from("messages").insert()` in the
 * page: `clinic_id`, `author_user_id` and `author_kind` all have to be right,
 * and the browser is the wrong place to decide any of them. Here they are read
 * from the thread and the session. The browser sends a thread id and some text.
 *
 * None of that is the security boundary — migration 0038's insert policy is,
 * and it independently refuses a forged author, a staff author_kind from a
 * family session, and any thread the caller may not use. This route exists so
 * a correct request is easy to make, not so an incorrect one is impossible.
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

  const threadId = typeof req.body?.threadId === "string" ? req.body.threadId : "";
  const body = typeof req.body?.body === "string" ? req.body.body : "";

  if (!threadId) {
    res.status(400).json({ error: "Which conversation?" });
    return;
  }
  const problem = messageProblem(body);
  if (problem) {
    res.status(400).json({ error: problem });
    return;
  }

  // Reading the thread through the caller's own session, so RLS decides
  // whether it exists for them. A thread they may not use comes back as "not
  // found" rather than "forbidden" — the difference between those two answers
  // is itself a disclosure that the thread exists.
  const { data: thread, error: threadError } = await supabase
    .from("message_threads")
    .select("id, clinic_id")
    .eq("id", threadId)
    .maybeSingle();

  if (threadError) {
    // The message, not the cause. A Postgres error string can name columns,
    // constraints and occasionally row values, none of which belong in a
    // browser response on a portal that carries PHI.
    console.error("messages/send: thread lookup failed:", threadError.message);
    res.status(500).json({ error: "Something went wrong. Try again shortly." });
    return;
  }
  if (!thread) {
    res.status(404).json({ error: "That conversation is not available." });
    return;
  }

  const { error: insertError } = await supabase.from("messages").insert({
    clinic_id: thread.clinic_id,
    thread_id: thread.id,
    author_user_id: user.id,
    author_kind: "family",
    body: body.trim(),
    // Never settable from here. A family message is shared by definition, and
    // the database refuses any other value from a family author anyway.
    visibility: "shared",
  });

  if (insertError) {
    console.error("messages/send: insert failed:", insertError.message);
    res.status(500).json({ error: "Your message was not sent. Try again shortly." });
    return;
  }

  res.status(200).json({ ok: true });
}
