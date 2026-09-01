import type { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "../../../lib/supabase-server";

/**
 * Record that this person has read the messages in a thread.
 *
 * Per reader, not per message: "read" on a shared family record has to mean
 * "read by you", or one parent opening a thread clears the badge for the other,
 * who never saw it.
 *
 * Only messages the caller can already select are marked, so this cannot be
 * used to probe for the existence of an internal note — RLS hands back only
 * shared messages in threads the caller may use, and an id list is built from
 * that rather than from the request.
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

  const threadId = typeof req.body?.threadId === "string" ? req.body.threadId : "";
  if (!threadId) {
    res.status(400).json({ error: "Which conversation?" });
    return;
  }

  const { data: rows, error } = await supabase
    .from("messages")
    .select("id")
    .eq("thread_id", threadId);

  if (error) {
    console.error("messages/mark-read: lookup failed:", error.message);
    res.status(500).json({ error: "Something went wrong." });
    return;
  }
  if (!rows || rows.length === 0) {
    // Nothing readable in that thread, which includes the case where the
    // thread is not the caller's. Same answer either way, on purpose.
    res.status(200).json({ ok: true, marked: 0 });
    return;
  }

  // Re-reading a thread is the common case, so a duplicate is expected rather
  // than exceptional. Ignoring the conflict keeps the first read time, which is
  // the one worth having.
  const { error: insertError } = await supabase
    .from("message_reads")
    .upsert(
      rows.map((r) => ({ message_id: r.id, user_id: user.id })),
      { onConflict: "message_id,user_id", ignoreDuplicates: true },
    );

  if (insertError) {
    console.error("messages/mark-read: upsert failed:", insertError.message);
    // Not fatal to the reader: they have the thread open and are looking at it.
    // A stale badge is a smaller problem than an error over the top of it.
    res.status(200).json({ ok: true, marked: 0 });
    return;
  }

  res.status(200).json({ ok: true, marked: rows.length });
}
