// app/services/resend.server.ts
// Email sending via Hetzner VPS SMTP relay (Postfix + OpenDKIM).
// Drop-in replacement for the old Resend-based implementation.
// Env vars: SMTP_HOST, SMTP_PORT (default 587), SMTP_USER, SMTP_PASS, SMTP_FROM_EMAIL

import nodemailer from "nodemailer";

let _transporter: nodemailer.Transporter | null = null;

function getTransporter() {
  if (_transporter) return _transporter;

  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT ?? "587", 10);
  const user = process.env.SMTP_USER ?? "";
  const pass = process.env.SMTP_PASS ?? "";

  if (!host) {
    console.warn("[smtp] SMTP_HOST not set — emails will be no-op");
    _transporter = nodemailer.createTransport({ jsonTransport: true });
    return _transporter;
  }

  _transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: user ? { user, pass } : undefined,
    tls: { rejectUnauthorized: process.env.NODE_ENV === "production" },
  });

  return _transporter;
}

export type SendEmailArgs = {
  from: string;
  to: string | string[];
  subject: string;
  html: string;
  replyTo?: string;
  headers?: Record<string, string>;
  tags?: Array<{ name: string; value: string }>;
};

export type SendEmailResult =
  | { ok: true; id: string }
  | { ok: false; error: string };

export async function sendEmail(args: SendEmailArgs): Promise<SendEmailResult> {
  try {
    const t = getTransporter();
    const info = await t.sendMail({
      from: args.from,
      to: Array.isArray(args.to) ? args.to.join(", ") : args.to,
      subject: args.subject,
      html: args.html,
      replyTo: args.replyTo,
      headers: args.headers,
    });
    return { ok: true, id: (info as any).messageId ?? "sent" };
  } catch (err: any) {
    const msg = err?.message ?? "Unknown SMTP error";
    console.error("[smtp] sendEmail failed:", msg);
    return { ok: false, error: msg };
  }
}

export type BatchEmailItem = Omit<SendEmailArgs, "to"> & { to: string };

export async function sendEmailBatch(
  emails: BatchEmailItem[]
): Promise<{ sent: number; failed: number; errors: string[] }> {
  let sent = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const email of emails) {
    const result = await sendEmail(email);
    if (result.ok) {
      sent++;
    } else {
      failed++;
      errors.push(`${email.to}: ${result.error}`);
    }
    // ~20 emails/sec to avoid overwhelming the relay
    await new Promise((r) => setTimeout(r, 50));
  }

  return { sent, failed, errors };
}

export function buildUnsubscribeFooter(unsubscribeUrl: string, footerText?: string): string {
  const storeFooter = footerText?.trim()
    ? `<p style="margin:0 0 6px;">${footerText.replace(/\n/g, "<br>")}</p>`
    : "";
  return `
<div style="text-align:center;padding:24px 0 16px;border-top:1px solid #e5e5e5;margin-top:32px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:12px;color:#9ca3af;">
  ${storeFooter}<p style="margin:0 0 8px;">
    You're receiving this because you subscribed to updates from this store.
  </p>
  <p style="margin:0;">
    <a href="${unsubscribeUrl}" style="color:#6366f1;text-decoration:underline;">Unsubscribe</a>
  </p>
</div>`;
}
