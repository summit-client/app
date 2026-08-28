import { NextResponse, type NextRequest } from "next/server";
import { resolveCourseLink } from "@/lib/content-server";

/**
 * Resolves a course key to its real BrightHR/BrightSafe URL and redirects.
 * Keeps the vendor tenant ID server-side instead of in the client bundle
 * that lib/content.ts ships to the browser. Already behind proxy.ts's auth
 * gate like every other route in this app - no PHI or per-user data here,
 * just an external link a signed-in employee is allowed to open.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const url = resolveCourseLink(key);
  if (!url) return NextResponse.json({ error: "Unknown course" }, { status: 404 });
  return NextResponse.redirect(url);
}
