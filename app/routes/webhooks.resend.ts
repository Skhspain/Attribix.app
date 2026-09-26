// app/routes/webhooks.resend.ts
// Delivery events from Resend (bounces, spam complaints, deliveries).
// Configure in Resend → Webhooks → endpoint https://api.attribix.app/webhooks/resend
// with events email.delivered, email.bounced, email.complained, and put the
// signing secret in the RESEND_WEBHOOK_SECRET Fly secret.
//
// Bounced and complaining addresses are suppressed so we stop mailing them —
// repeated sends to dead or unwilling inboxes are what gets a sender blocked.

import crypto from "node:crypto";
import { json, type ActionFunctionArgs } from "@remix-run/node";
import db from "~/db.server";

const TOLERANCE_S = 5 * 60;

/** Resend signs webhooks with Svix: HMAC-SHA256 over "id.timestamp.body". */
export function verifySvixSignature(secret: string, headers: Headers, body: string): boolean {
  const id = headers.get("svix-id");
  const ts = headers.get("svix-timestamp");
  const sigHeader = headers.get("svix-signature");
  if (!id || !ts || !sigHeader) return false;
  if (Math.abs(Date.now() / 1000 - Number(ts)) > TOLERANCE_S) return false;

  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const expected = crypto.createHmac("sha256", key).update(`${id}.${ts}.${body}`).digest();
  return sigHeader.split(" ").some((part) => {
    const [version, sig] = part.split(",");
    if (version !== "v1" || !sig) return false;
    const given = Buffer.from(sig, "base64");
    return given.length === expected.length && crypto.timingSafeEqual(given, expected);
  });
}

function tag(data: any, name: string): string | null {
  const t = data?.tags;
  if (!t) return null;
  if (Array.isArray(t)) return t.find((x: any) => x?.name === name)?.value ?? null;
  return typeof t[name] === "string" ? t[name] : null;
}

export async function action({ request }: ActionFunctionArgs) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  const body = await request.text();
  if (!secret || !verifySvixSignature(secret, request.headers, body)) {
    return json({ ok: false }, { status: 401 });
  }

  let event: any;
  try {
    event = JSON.parse(body);
  } catch {
    return json({ ok: false }, { status: 400 });
  }

  const anyDb = db as any;
  const type: string = event?.type ?? "";
  const data = event?.data ?? {};
  const providerId: string | null = data.email_id ?? null;
  const recipient: string | null = (Array.isArray(data.to) ? data.to[0] : data.to)?.toLowerCase?.() ?? null;

  const send = providerId
    ? await anyDb.newsletterSend.findFirst({ where: { providerId } }).catch(() => null)
    : null;
  const shop: string | null = send?.shop ?? tag(data, "shop");

  try {
    if (type === "email.delivered" && send) {
      await anyDb.newsletterSend.update({ where: { id: send.id }, data: { deliveredAt: new Date() } });
    }

    if (type === "email.bounced" || type === "email.complained") {
      const status = type === "email.bounced" ? "bounced" : "complained";
      // Soft/temporary bounces don't mean the address is dead.
      const bounceType = String(data?.bounce?.type ?? "").toLowerCase();
      const permanent = status === "complained" || !bounceType || bounceType.includes("perm") || bounceType === "hard";

      if (send && send.status !== status) {
        await anyDb.newsletterSend.update({ where: { id: send.id }, data: { status } });
        if (status === "bounced") {
          await anyDb.newsletterCampaign.update({ where: { id: send.campaignId }, data: { bounceCount: { increment: 1 } } }).catch(() => null);
        } else {
          await anyDb.newsletterCampaign.update({ where: { id: send.campaignId }, data: { unsubCount: { increment: 1 } } }).catch(() => null);
        }
      }

      if (permanent && recipient) {
        // A dead mailbox is dead for every store; a complaint is about one store.
        const where = status === "bounced" && !shop ? { email: recipient } : shop ? { shop, email: recipient } : null;
        if (where) {
          await anyDb.newsletterSubscriber.updateMany({
            where: { ...where, status: { not: "complained" } },
            data: { status, unsubscribedAt: new Date() },
          });
        }
        if (shop) {
          await anyDb.automationEnrollment.updateMany({ where: { shop, email: recipient, status: "active" }, data: { status: "cancelled" } }).catch(() => null);
        }
      }
    }
  } catch (e: any) {
    console.error("[resend webhook] error:", e?.message ?? e);
    return json({ ok: false }, { status: 500 });
  }

  return json({ ok: true });
}
