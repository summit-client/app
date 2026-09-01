import type { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "../../../lib/supabase-server";

const MAX_BODY_LENGTH = 4000;

/**
 * Sends one message from the signed-in family account into their child's
 * care-team thread (client_messages, migration 0035).
 *
 * Deliberately real-client-only, never usable from admin "view as" -
 * lib/admin-view-as.ts's own header says apps/client had no forms or
 * mutations anywhere "so there is nothing for an admin to do 'as' the
 * family by mistake." Sending a message is the first mutation this app has
 * ever had, and it would be exactly the kind of thing that notice warns
 * about if an admin impersonating a family could fire it - so this route
 * resolves the caller's own `clients` row directly (profiles.role +
 * clients.user_id), not resolveViewedClient(), which is what admits the
 * view-as cookie. An admin who wants to send something on a family's
 * behalf does it through their own real account, not this one.
 *
 * clinic_id/sender_user_id/sender_role are never sent from here - the
 * client_messages_before_insert trigger derives all three server-side (see
 * the migration's header), so this route only ever supplies client_id and
 * body, and RLS (client_messages_client_write) is still the actual
 * enforcement regardless of what this route gets right or wrong.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.status(405).end();
    return;
  }

  const supabase = createClient(req, res);

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    res.status(401).send("Not signed in");
    return;
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) {
    console.error("messages/send: profile lookup failed:", profileError.message);
    res.status(500).send("Could not verify your account");
    return;
  }

  if (profile?.role !== "client") {
    res.status(403).send("Not permitted");
    return;
  }

  const { data: client, error: clientError } = await supabase
    .from("clients")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (clientError) {
    console.error("messages/send: client lookup failed:", clientError.message);
    res.status(500).send("Could not verify your account");
    return;
  }

  if (!client) {
    res.status(404).send("No client record is linked to your account");
    return;
  }

  const raw = typeof req.body?.body === "string" ? req.body.body : "";
  const body = raw.trim();

  if (!body) {
    res.status(400).send("Message cannot be empty");
    return;
  }
  if (body.length > MAX_BODY_LENGTH) {
    res.status(400).send(`Message is too long (max ${MAX_BODY_LENGTH} characters)`);
    return;
  }

  const { error: insertError } = await supabase
    .from("client_messages")
    .insert({ client_id: client.id, body });

  if (insertError) {
    console.error("messages/send: insert failed:", insertError.message);
    res.status(500).send("Could not send your message");
    return;
  }

  res.status(200).json({ ok: true });
}
