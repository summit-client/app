/**
 * Strict, anti-spoof email-domain validation for the Employee Hub.
 *
 * Only addresses whose domain is EXACTLY the allowed domain may access the Hub.
 * This rejects domain tricks like `employee@mountetnachildservices.com.attacker.com`
 * (its domain is `mountetnachildservices.com.attacker.com`, not the allowed one)
 * and subdomains like `x@sub.mountetnachildservices.com`.
 */

export function hubAllowedDomain(): string {
  return (process.env.HUB_ALLOWED_EMAIL_DOMAIN || "mountetnachildservices.com")
    .trim()
    .toLowerCase();
}

/** Lowercase + trim; never mutate the local part beyond casing. */
export function normalizeEmail(raw: unknown): string {
  return String(raw ?? "").trim().toLowerCase();
}

export function isAllowedHubEmail(email: string, domain = hubAllowedDomain()): boolean {
  if (!email || /\s/.test(email)) return false; // no whitespace anywhere
  const at = email.indexOf("@");
  if (at <= 0) return false; // must have a non-empty local part
  if (email.indexOf("@", at + 1) !== -1) return false; // exactly one "@"
  const local = email.slice(0, at);
  const dom = email.slice(at + 1);
  // Conservative local-part charset (RFC-practical); prevents header/quote tricks.
  if (!/^[a-z0-9._%+-]+$/.test(local)) return false;
  return dom === domain; // exact domain match, no subdomains, no suffixes
}

/** The exact message required when a non-Mount-Etna email is used. */
export const HUB_DOMAIN_REJECT_MESSAGE =
  "This portal is available only to Mount Etna Child & Family Services team members.";
