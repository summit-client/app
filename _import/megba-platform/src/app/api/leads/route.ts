import { NextResponse } from "next/server";
import { leadSchema } from "@/lib/validation";
import { sendEmail } from "@/lib/email";

/**
 * Lead intake endpoint.
 * - Validates with zod (discriminated union by `kind`).
 * - Rejects honeypot submissions (spam protection).
 * - Sends a confirmation to the submitter + an internal notification.
 * - Returns CRM-ready structured data.
 *
 * Phase 2: persist to the `Lead` / `FormSubmission` tables (Prisma) and forward
 * to CRM_WEBHOOK_URL. This handler is intentionally storage-agnostic.
 */
export async function POST(request: Request) {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON." }, { status: 400 });
  }

  const parsed = leadSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Validation failed.", issues: parsed.error.flatten() },
      { status: 422 },
    );
  }

  const data = parsed.data;

  // Honeypot: if filled, silently accept without processing.
  if ("company_website" in data && data.company_website) {
    return NextResponse.json({ ok: true });
  }

  const inbox = process.env.EMAIL_LEADS_INBOX ?? "megba@mountetnachildservices.com";
  const submitterEmail = "email" in data ? data.email : undefined;

  // Internal notification.
  await sendEmail({
    to: inbox,
    subject: `New ${data.kind} lead, MEGBA`,
    text: JSON.stringify(data, null, 2),
    replyTo: submitterEmail,
  });

  // Submitter confirmation.
  if (submitterEmail) {
    await sendEmail({
      to: submitterEmail,
      subject: "We've received your message, MEGBA",
      text: "Thank you for contacting Mount Etna Global Behaviour Academy. A member of our team will be in touch shortly.",
    });
  }

  // TODO(phase-2): persist + forward to CRM_WEBHOOK_URL.
  return NextResponse.json({ ok: true });
}
