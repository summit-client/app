/**
 * Email abstraction. Swap the provider via EMAIL_PROVIDER without touching
 * call sites. "console" logs to server output; "resend" delivers via the Resend
 * HTTP API (no SDK dependency) when RESEND_API_KEY is set. Returns whether the
 * message was actually delivered so callers never claim a false send.
 */
type SendArgs = { to: string; subject: string; text: string; replyTo?: string };

export async function sendEmail({ to, subject, text, replyTo }: SendArgs): Promise<{ delivered: boolean }> {
  const provider = process.env.EMAIL_PROVIDER ?? "console";

  if (provider === "resend") {
    const key = process.env.RESEND_API_KEY;
    const from = process.env.EMAIL_FROM;
    if (!key || !from) {
      console.info("[email:resend] not configured (RESEND_API_KEY / EMAIL_FROM); logging instead", { to, subject });
    } else {
      try {
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
          body: JSON.stringify({ from, to, subject, text, ...(replyTo ? { reply_to: replyTo } : {}) }),
        });
        if (res.ok) return { delivered: true };
        console.error("[email:resend] send failed", res.status, await res.text().catch(() => ""));
      } catch (e) {
        console.error("[email:resend] send error", e);
      }
    }
    return { delivered: false };
  }

  // console (default)
  console.info("\n──────── EMAIL (console provider) ────────");
  console.info("To:", to);
  console.info("Reply-To:", replyTo ?? "-");
  console.info("Subject:", subject);
  console.info(text);
  console.info("──────────────────────────────────────────\n");
  return { delivered: false };
}
