// app/services/resend.server.ts
// Outgoing email. Production uses Resend: its HTTP API (batch sends, message
// ids we can match to bounce/complaint webhooks). Any other SMTP relay still
// works through nodemailer, just without those extras.
// Env: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM_EMAIL, RESEND_API_KEY (optional; SMTP_PASS is the same key on Resend SMTP)

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

function resendKey(): string | null {
  if (process.env.RESEND_API_KEY) return process.env.RESEND_API_KEY;
  if (/resend\.com$/i.test(process.env.SMTP_HOST ?? "") && process.env.SMTP_PASS) return process.env.SMTP_PASS;
  return null;
}

export function sendingConfigured() {
  return !!process.env.SMTP_HOST || !!process.env.RESEND_API_KEY;
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

// Resend only accepts ASCII letters, numbers, underscores and dashes in tags.
function cleanTags(tags?: SendEmailArgs["tags"]) {
  return tags?.map((t) => ({ name: t.name.replace(/[^\w-]/g, "_"), value: t.value.replace(/[^\w-]/g, "_").slice(0, 256) }));
}

function toResendPayload(args: SendEmailArgs) {
  return {
    from: args.from,
    to: Array.isArray(args.to) ? args.to : [args.to],
    subject: args.subject,
    html: args.html,
    ...(args.replyTo && { reply_to: args.replyTo }),
    ...(args.headers && { headers: args.headers }),
    ...(args.tags?.length && { tags: cleanTags(args.tags) }),
  };
}

async function resendPost(path: string, body: unknown, key: string) {
  const res = await fetch(`https://api.resend.com${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  const data: any = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

export async function sendEmail(args: SendEmailArgs): Promise<SendEmailResult> {
  const key = resendKey();
  if (key) {
    try {
      const r = await resendPost("/emails", toResendPayload(args), key);
      if (r.ok && r.data?.id) return { ok: true, id: r.data.id };
      return { ok: false, error: r.data?.message || `Resend error ${r.status}` };
    } catch (err: any) {
      return { ok: false, error: err?.message ?? "Resend request failed" };
    }
  }

  try {
    const info = await getTransporter().sendMail({
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

/**
 * Sends up to 100 emails. Results are in the same order as the input. On
 * Resend this is one API call; otherwise one SMTP send per email.
 */
export async function sendBatch(emails: BatchEmailItem[]): Promise<SendEmailResult[]> {
  if (!emails.length) return [];
  const key = resendKey();
  if (key) {
    try {
      const r = await resendPost("/emails/batch", emails.map(toResendPayload), key);
      const ids: any[] = r.data?.data ?? [];
      if (r.ok && ids.length === emails.length) return ids.map((d) => ({ ok: true as const, id: String(d.id) }));
      const error = r.data?.message || `Resend batch error ${r.status}`;
      // Rate limited or temporarily down: report as failed so the queue retries.
      return emails.map(() => ({ ok: false as const, error }));
    } catch (err: any) {
      return emails.map(() => ({ ok: false as const, error: err?.message ?? "Resend request failed" }));
    }
  }

  const results: SendEmailResult[] = [];
  for (const email of emails) {
    results.push(await sendEmail(email));
    await new Promise((r) => setTimeout(r, 50));
  }
  return results;
}

export function buildUnsubscribeFooter(unsubscribeUrl: string, footerText?: string): string {
  const storeFooter = footerText?.trim()
    ? `<p style="margin:0 0 6px;">${footerText.replace(/</g, "&lt;").replace(/\n/g, "<br>")}</p>`
    : "";
  return `
<div style="text-align:center;padding:24px 0 16px;border-top:1px solid #e5e5e5;margin-top:32px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:12px;color:#6b7280;">
  ${storeFooter}<p style="margin:0 0 8px;">
    You're receiving this because you subscribed to updates from this store.
  </p>
  <p style="margin:0;">
    <a href="${unsubscribeUrl}" style="color:#6b7280;text-decoration:underline;">Unsubscribe</a>
  </p>
</div>`;
}
