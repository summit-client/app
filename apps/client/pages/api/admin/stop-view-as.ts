import type { NextApiRequest, NextApiResponse } from "next";
import { clearViewAsCookie } from "../../../lib/admin-view-as";

/** Clears admin_view_as_client. No auth check needed beyond "has this
 *  cookie at all" - clearing your own cookie can't affect anyone else. */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.status(405).end();
    return;
  }
  clearViewAsCookie(res);
  res.redirect(302, "/admin/select-client");
}
