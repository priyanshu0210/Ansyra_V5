// ─────────────────────────────────────────────────────────────────────────────
// App-side email notifications (Phase 11.4) — one thin sendEmail() over the
// Resend REST API. RESEND_API_KEY is OPTIONAL: absent, every send logs and
// skips so no feature ever depends on email being configured. (Auth emails —
// invites, password resets — go through Supabase SMTP, not this helper.)
//
// The outcome is returned rather than swallowed so a caller that records
// "sent" (the deadline sweep) can tell a delivery from a failure and try again
// next run instead of marking a reminder done that nobody received.
// ─────────────────────────────────────────────────────────────────────────────

import { env } from "./env";

const FROM = env.emailFrom || "Ansyra <onboarding@resend.dev>";

/** "sent" — accepted by the provider; "skipped" — no provider configured or no
 *  recipients; "failed" — the provider refused or was unreachable. */
export type EmailOutcome = "sent" | "skipped" | "failed";

export async function sendEmail(opts: {
  to: string | string[];
  subject: string;
  text: string;
}): Promise<EmailOutcome> {
  const key = process.env.RESEND_API_KEY;
  const to = Array.isArray(opts.to) ? opts.to : [opts.to];
  if (to.length === 0) return "skipped";
  if (!key) {
    console.log(`[email] provider not configured — skipped one notification for ${to.length} recipient(s)`);
    return "skipped";
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({ from: FROM, to, subject: opts.subject, text: opts.text }),
      signal: AbortSignal.timeout(env.externalRequestTimeoutMs),
    });
    if (!res.ok) {
      console.warn(`[email] send failed (${res.status}):`, (await res.text()).slice(0, 300));
      return "failed";
    }
    return "sent";
  } catch (err) {
    // Notifications are fire-and-forget — never fail the calling action.
    console.warn("[email] send error:", err instanceof Error ? err.message : err);
    return "failed";
  }
}
