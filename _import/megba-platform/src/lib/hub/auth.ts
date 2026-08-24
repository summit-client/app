import { redirect } from "next/navigation";
import { getHubSessionUser, type HubSessionUser } from "./session";

/**
 * Server-side guards. Authorization is enforced here on the server, never in the
 * client. Use in server components / route handlers / server actions.
 */
export async function requireHubUser(): Promise<HubSessionUser> {
  const user = await getHubSessionUser();
  if (!user) redirect("/hub/login");
  return user;
}

/** Requires a completed profile; otherwise sends the user to first-login setup. */
export async function requireHubUserWithProfile(): Promise<HubSessionUser> {
  const user = await requireHubUser();
  if (!user.profile) redirect("/hub/welcome");
  return user;
}

export async function requireHubAdmin(): Promise<HubSessionUser> {
  const user = await requireHubUser();
  if (user.role !== "ADMIN") redirect("/hub");
  return user;
}

export function greeting(now = new Date()): string {
  const h = now.getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}
