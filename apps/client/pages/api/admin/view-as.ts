import type { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "../../../lib/supabase-server";
import { setViewAsCookie } from "../../../lib/admin-view-as";

/**
 * Sets the admin_view_as_client cookie so an admin can simulate what a
 * specific family sees. Only ever called from the picker rendered inline on
 * pages/index.tsx (components/select-client.tsx), but re-checks everything
 * itself rather than trusting that caller - the clientId in the request body
 * is untrusted input regardless of which page happened to submit it.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.status(405).end();
    return;
  }

  const clientId = typeof req.body?.clientId === "string" ? req.body.clientId : "";
  if (!clientId) {
    res.status(400).send("Missing clientId");
    return;
  }

  const supabase = createClient(req, res);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    res.status(401).send("Not signed in");
    return;
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, clinic_id")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.role !== "admin" || !profile.clinic_id) {
    res.status(403).send("Not permitted");
    return;
  }

  // The client must belong to the admin's own clinic - never take the
  // request's word for which client this id points to.
  const { data: client } = await supabase
    .from("clients")
    .select("id")
    .eq("id", clientId)
    .eq("clinic_id", profile.clinic_id)
    .maybeSingle();

  if (!client) {
    res.status(404).send("Client not found");
    return;
  }

  setViewAsCookie(res, client.id);
  res.redirect(302, "/");
}
