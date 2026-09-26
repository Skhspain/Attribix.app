// app/services/newsletter.server.ts
// Core newsletter business logic: subscribers, campaigns, sending, unsubscribe tokens.
// NEW FILE — does not touch any existing code.

import crypto from "node:crypto";
import db from "~/db.server";
import { buildUnsubscribeFooter, type BatchEmailItem } from "~/services/resend.server";

// ─── Unsubscribe token ────────────────────────────────────────────────────────

// New links are signed with a real secret. Links already sent were signed with
// the old hard-coded default; those keep working until LEGACY_UNSUB_UNTIL so
// nobody who received an older email loses their unsubscribe link.
const UNSUB_SECRET =
  process.env.NEWSLETTER_UNSUB_SECRET || process.env.SHOPIFY_API_SECRET || "attribix-unsub-secret-change-me";
const LEGACY_UNSUB_SECRET = "attribix-unsub-secret-change-me";
const LEGACY_UNSUB_UNTIL = new Date("2027-03-31T00:00:00Z");

function unsubSig(secret: string, payload: string) {
  return crypto.createHmac("sha256", secret).update(payload).digest("hex");
}

function safeEqual(a: string, b: string) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

export function generateUnsubscribeToken(shop: string, email: string): string {
  const payload = `${shop}:${email.toLowerCase().trim()}`;
  return Buffer.from(`${payload}:${unsubSig(UNSUB_SECRET, payload)}`).toString("base64url");
}

export function verifyUnsubscribeToken(token: string): { shop: string; email: string } | null {
  try {
    const decoded = Buffer.from(token, "base64url").toString("utf8");
    const lastColon = decoded.lastIndexOf(":");
    if (lastColon < 0) return null;

    const payload = decoded.slice(0, lastColon);
    const sig = decoded.slice(lastColon + 1);
    const valid =
      safeEqual(sig, unsubSig(UNSUB_SECRET, payload)) ||
      (Date.now() < LEGACY_UNSUB_UNTIL.getTime() && safeEqual(sig, unsubSig(LEGACY_UNSUB_SECRET, payload)));
    if (!valid) return null;

    const firstColon = payload.indexOf(":");
    if (firstColon < 0) return null;

    const shop = payload.slice(0, firstColon);
    const email = payload.slice(firstColon + 1);
    return { shop, email };
  } catch {
    return null;
  }
}

// ─── Shared email preparation (campaigns + flows) ───────────────────────────────

const PUBLIC_URL = (process.env.SHOPIFY_APP_URL || "https://api.attribix.app").replace(/\/$/, "");

export function unsubscribeUrlFor(shop: string, email: string) {
  return `${PUBLIC_URL}/newsletter/unsubscribe?token=${generateUnsubscribeToken(shop, email)}`;
}

/**
 * Gmail and Yahoo require one-click unsubscribe headers (RFC 8058) on bulk mail.
 * Mail clients POST "List-Unsubscribe=One-Click" to this URL.
 */
export function listUnsubscribeHeaders(unsubUrl: string): Record<string, string> {
  return {
    "List-Unsubscribe": `<${unsubUrl}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  };
}

/** Fills merge tags. Supports the block editor's {{tags}} and the old {name}/{shop} ones. */
export function personalize(html: string, v: { shop: string; email: string; firstName?: string | null; unsubscribeUrl: string }) {
  const shopName = v.shop.replace(".myshopify.com", "");
  const first = v.firstName?.trim() || "";
  const year = String(new Date().getFullYear());
  return html
    .replace(/\{\{\s*first_name\s*\}\}/gi, first || "there")
    .replace(/\{\{\s*name\s*\}\}/gi, first || "there")
    .replace(/\{\{\s*email\s*\}\}/gi, v.email)
    .replace(/\{\{\s*shop_url\s*\}\}/gi, `https://${v.shop}`)
    .replace(/\{\{\s*shop\s*\}\}/gi, shopName)
    .replace(/\{\{\s*unsubscribe_url\s*\}\}/gi, v.unsubscribeUrl)
    .replace(/\{year\}\}/g, year)
    .replace(/\{\{\s*year\s*\}\}/gi, year)
    .replace(/\{year\}/gi, year)
    .replace(/\{name\}/g, first || "there")
    .replace(/\{shop\}/g, shopName);
}

/** Adds an unsubscribe footer only if the design doesn't already contain one. */
export function ensureUnsubscribeFooter(html: string, footerText?: string) {
  if (/\{\{\s*unsubscribe_url\s*\}\}/i.test(html)) return html;
  const footer = buildUnsubscribeFooter("{{unsubscribe_url}}", footerText);
  return html.includes("</body>") ? html.replace("</body>", `${footer}</body>`) : html + footer;
}

/**
 * Sender for marketing mail. The merchant's own address is only used as From
 * when their domain is verified (otherwise DMARC fails); until then we send from
 * the shared domain and route replies to the merchant.
 */
export function senderFor(opts: {
  fromName?: string | null;
  merchantEmail?: string | null;
  replyTo?: string | null;
  domainVerified: boolean;
  shop: string;
}) {
  const name = (opts.fromName || opts.shop.replace(".myshopify.com", "")).replace(/[<>"]/g, "");
  const shared = process.env.SMTP_FROM_EMAIL || "newsletters@attribix.email";
  const fromEmail = opts.domainVerified && opts.merchantEmail ? opts.merchantEmail : shared;
  const replyTo = opts.replyTo || (fromEmail === shared ? opts.merchantEmail : undefined) || undefined;
  return { from: `${name} <${fromEmail}>`, replyTo };
}

// Click tracking: links are signed so /api/newsletter/track can't be used as an
// open redirect to arbitrary sites.
const CLICK_SECRET = process.env.SHOPIFY_API_SECRET || UNSUB_SECRET;

export function clickSignature(campaignId: string, url: string) {
  return crypto.createHmac("sha256", CLICK_SECRET).update(`${campaignId}|${url}`).digest("base64url").slice(0, 22);
}

export function verifyClickSignature(campaignId: string, url: string, sig: string) {
  return !!sig && safeEqual(sig, clickSignature(campaignId, url));
}

/**
 * Tags a link so the resulting visit (and any order) is attributed to this
 * campaign: utm_medium=email feeds the email revenue totals and
 * utm_campaign=<campaign id> gives per-campaign revenue.
 */
export function withEmailUtm(url: string, campaignId: string) {
  try {
    const u = new URL(url);
    if (u.searchParams.has("utm_source")) return url;
    u.searchParams.set("utm_source", "attribix");
    u.searchParams.set("utm_medium", "email");
    u.searchParams.set("utm_campaign", campaignId);
    return u.toString();
  } catch {
    return url;
  }
}

export function trackLinks(html: string, campaignId: string) {
  return html.replace(/href="(https?:\/\/[^"]+)"/g, (match, rawUrl: string) => {
    if (rawUrl.includes("/newsletter/unsubscribe")) return match;
    const url = withEmailUtm(rawUrl.replace(/&amp;/g, "&"), campaignId);
    const tracked = `${PUBLIC_URL}/api/newsletter/track?type=click&cid=${encodeURIComponent(campaignId)}&sid={{send_id}}&url=${encodeURIComponent(url)}&sig=${clickSignature(campaignId, url)}`;
    return `href="${tracked.replace(/&/g, "&amp;")}"`;
  });
}

// ─── Subscribers ─────────────────────────────────────────────────────────────

export async function subscribeEmail(args: {
  shop: string;
  email: string;
  firstName?: string;
  lastName?: string;
  source?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  gclid?: string;
  fbclid?: string;
  /** Signup IP, kept as consent evidence. */
  ip?: string | null;
  /** Merchant-added contacts (import, manual) skip double opt-in. */
  skipConfirmation?: boolean;
}): Promise<{ ok: boolean; created: boolean; pending?: boolean; message?: string }> {
  const email = args.email.toLowerCase().trim();

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, created: false, message: "Invalid email address" };
  }

  try {
    const settings = await (db as any).newsletterSettings
      ?.findUnique?.({ where: { shop: args.shop }, select: { doubleOptIn: true } })
      .catch(() => null);
    const needsConfirm = !!settings?.doubleOptIn && !args.skipConfirmation;
    const status = needsConfirm ? "pending" : "subscribed";
    const confirmedAt = needsConfirm ? null : new Date();

    const existing = await db.newsletterSubscriber.findUnique({
      where: { shop_email: { shop: args.shop, email } },
    });

    if (existing?.status === "subscribed") {
      return { ok: true, created: false, message: "Already subscribed" };
    }
    // Someone who marked us as spam stays suppressed.
    if (existing?.status === "complained") {
      return { ok: true, created: false, message: "Already subscribed" };
    }

    if (existing) {
      // Re-subscribe (or re-send the confirmation for a pending signup).
      await db.newsletterSubscriber.update({
        where: { shop_email: { shop: args.shop, email } },
        data: { status, unsubscribedAt: null, confirmedAt, consentIp: args.ip ?? existing.consentIp ?? null } as any,
      });
    } else {
      await db.newsletterSubscriber.create({
        data: {
          shop: args.shop,
          email,
          firstName: args.firstName ?? null,
          lastName: args.lastName ?? null,
          status,
          source: args.source ?? "manual",
          utmSource: args.utmSource ?? null,
          utmMedium: args.utmMedium ?? null,
          utmCampaign: args.utmCampaign ?? null,
          gclid: args.gclid ?? null,
          fbclid: args.fbclid ?? null,
          confirmedAt,
          consentIp: args.ip ?? null,
        } as any,
      });
    }

    if (needsConfirm) {
      await sendConfirmationEmail(args.shop, email, args.firstName).catch((e: any) =>
        console.error("[newsletter] confirmation email error:", e?.message),
      );
      return { ok: true, created: !existing, pending: true, message: "Check your inbox to confirm your subscription." };
    }
    await startWelcomeFlows(args.shop, email, args.firstName ?? existing?.firstName);
    return { ok: true, created: !existing, message: existing ? "Re-subscribed" : undefined };
  } catch (err: any) {
    console.error(`[newsletter] subscribeEmail error: ${err?.message}`);
    return { ok: false, created: false, message: err?.message };
  }
}

// ─── Double opt-in ────────────────────────────────────────────────────────────

const CONFIRM_TTL_MS = 14 * 24 * 60 * 60 * 1000;

export function confirmUrlFor(shop: string, email: string) {
  const payload = `confirm:${shop}:${email}:${Date.now()}`;
  const token = Buffer.from(`${payload}:${unsubSig(UNSUB_SECRET, payload)}`).toString("base64url");
  return `${PUBLIC_URL}/newsletter/confirm?token=${token}`;
}

export function verifyConfirmToken(token: string): { shop: string; email: string } | null {
  try {
    const decoded = Buffer.from(token, "base64url").toString("utf8");
    const lastColon = decoded.lastIndexOf(":");
    const payload = decoded.slice(0, lastColon);
    if (!safeEqual(decoded.slice(lastColon + 1), unsubSig(UNSUB_SECRET, payload))) return null;
    const [kind, shop, ...rest] = payload.split(":");
    const issuedAt = Number(rest.pop());
    if (kind !== "confirm" || !shop || !Number.isFinite(issuedAt) || Date.now() - issuedAt > CONFIRM_TTL_MS) return null;
    return { shop, email: rest.join(":") };
  } catch {
    return null;
  }
}

export async function confirmSubscription(shop: string, email: string, ip: string | null) {
  const pending = await db.newsletterSubscriber.findFirst({ where: { shop, email, status: "pending" } });
  const res = await db.newsletterSubscriber.updateMany({
    where: { shop, email, status: { in: ["pending", "subscribed"] } },
    data: { status: "subscribed", confirmedAt: new Date(), consentIp: ip } as any,
  });
  if (pending) await startWelcomeFlows(shop, email, pending.firstName);
  return res.count > 0;
}

/** "New subscriber" flows start once someone is actually subscribed (after confirming, with double opt-in). */
async function startWelcomeFlows(shop: string, email: string, firstName?: string | null) {
  const { enrollInFlows } = await import("~/services/automationEngine.server");
  await enrollInFlows({ shop, trigger: "subscriber_created", email, firstName: firstName ?? undefined }).catch(() => null);
}

async function sendConfirmationEmail(shop: string, email: string, firstName?: string) {
  const { renderEmail, createBlock, EMAIL_DOC_FORMAT, DEFAULT_THEME } = await import("~/email/blocks");
  const { sendEmail } = await import("~/services/resend.server");
  const anyDb = db as any;
  const settings = await anyDb.newsletterSettings?.findUnique?.({ where: { shop } }).catch(() => null);
  const storeName = settings?.fromName || shop.replace(".myshopify.com", "");
  const url = confirmUrlFor(shop, email);

  const heading = { ...createBlock("heading"), text: "Please confirm your subscription" } as any;
  const text = {
    ...createBlock("text"),
    text: `${firstName ? `Hi ${firstName}, t` : "T"}hanks for signing up to ${storeName}. Click the button below to confirm — you'll only get our emails once you do.`,
  } as any;
  const button = { ...createBlock("button"), label: "Yes, subscribe me", href: url } as any;
  const footer = { ...createBlock("footer"), text: "If you didn't sign up, just ignore this email — you won't hear from us again.", address: "" } as any;
  const html = renderEmail(
    {
      format: EMAIL_DOC_FORMAT,
      theme: { ...DEFAULT_THEME },
      blocks: [{ ...createBlock("header"), storeName } as any, heading, text, button, footer],
    },
    { unsubscribeUrl: unsubscribeUrlFor(shop, email) },
  );

  const sender = senderFor({
    fromName: storeName,
    merchantEmail: settings?.fromEmail,
    replyTo: settings?.replyTo,
    domainVerified: settings?.resendDomainStatus === "verified",
    shop,
  });
  const result = await sendEmail({ from: sender.from, replyTo: sender.replyTo, to: email, subject: `Confirm your subscription to ${storeName}`, html, tags: [{ name: "shop", value: shop }, { name: "kind", value: "confirm" }] });
  if (result.ok) {
    await db.newsletterSubscriber.updateMany({ where: { shop, email }, data: { confirmSentAt: new Date() } as any });
  }
}

export async function unsubscribeEmail(shop: string, email: string): Promise<boolean> {
  try {
    const norm = email.toLowerCase().trim();
    await db.newsletterSubscriber.updateMany({
      where: { shop, email: norm },
      data: { status: "unsubscribed", unsubscribedAt: new Date() },
    });
    return true;
  } catch (err: any) {
    console.error(`[newsletter] unsubscribeEmail error: ${err?.message}`);
    return false;
  }
}

// ─── Subscriber segmentation ──────────────────────────────────────────────────

export type SegmentFilter = {
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  source?: string;
  /** Only people who subscribed in the last N days (evaluated at send time). */
  joinedWithinDays?: number;
  createdAfter?: Date | string;
  createdBefore?: Date | string;
};

function segmentWhere(shop: string, filter?: SegmentFilter | null) {
  const where: any = { shop, status: "subscribed" };
  if (filter?.utmSource) where.utmSource = filter.utmSource;
  if (filter?.utmMedium) where.utmMedium = filter.utmMedium;
  if (filter?.utmCampaign) where.utmCampaign = filter.utmCampaign;
  if (filter?.source) where.source = filter.source;
  const after = filter?.joinedWithinDays
    ? new Date(Date.now() - Number(filter.joinedWithinDays) * 24 * 60 * 60 * 1000)
    : filter?.createdAfter
      ? new Date(filter.createdAfter)
      : null;
  if (after || filter?.createdBefore) {
    where.createdAt = {};
    if (after) where.createdAt.gte = after;
    if (filter?.createdBefore) where.createdAt.lte = new Date(filter.createdBefore);
  }
  return where;
}

export async function getSubscribersForSegment(
  shop: string,
  filter?: SegmentFilter | null
): Promise<Array<{ email: string; firstName: string | null; lastName: string | null }>> {
  return db.newsletterSubscriber.findMany({
    where: segmentWhere(shop, filter),
    select: { email: true, firstName: true, lastName: true },
    orderBy: { createdAt: "desc" },
  });
}

export async function countSubscribersForSegment(shop: string, filter?: SegmentFilter | null): Promise<number> {
  return db.newsletterSubscriber.count({ where: segmentWhere(shop, filter) });
}

// ─── Campaign sending ─────────────────────────────────────────────────────────
// The queue (services/newsletterQueue.server.ts) does the actual sending; these
// helpers turn a campaign into one email per recipient.

export type PreparedCampaign = {
  id: string;
  shop: string;
  subject: string;
  from: string;
  replyTo?: string;
  template: string;
};

export async function prepareCampaign(campaign: any): Promise<PreparedCampaign> {
  const settings = await (db as any).newsletterSettings
    ?.findUnique?.({ where: { shop: campaign.shop }, select: { footerText: true, resendDomainStatus: true } })
    .catch(() => null);
  const sender = senderFor({
    fromName: campaign.fromName,
    merchantEmail: campaign.fromEmail,
    replyTo: campaign.replyTo,
    domainVerified: settings?.resendDomainStatus === "verified",
    shop: campaign.shop,
  });

  // Tracking and footer are identical for everyone; {{send_id}} is filled per
  // recipient so opens and clicks are counted per person.
  const openPixel = `<img src="${PUBLIC_URL}/api/newsletter/track?type=open&amp;cid=${encodeURIComponent(campaign.id)}&amp;sid={{send_id}}" width="1" height="1" alt="" style="display:block;width:1px;height:1px;border:0;padding:0;margin:0;">`;
  let template = trackLinks(ensureUnsubscribeFooter(campaign.htmlContent ?? "", (settings?.footerText ?? "").trim()), campaign.id);
  template = template.includes("</body>") ? template.replace("</body>", `${openPixel}</body>`) : template + openPixel;

  return { id: campaign.id, shop: campaign.shop, subject: campaign.subject, from: sender.from, replyTo: sender.replyTo, template };
}

export function buildCampaignEmail(
  c: PreparedCampaign,
  recipient: { email: string; firstName?: string | null; sendId: string },
): BatchEmailItem {
  const unsubUrl = unsubscribeUrlFor(c.shop, recipient.email);
  const html = personalize(c.template, { shop: c.shop, email: recipient.email, firstName: recipient.firstName, unsubscribeUrl: unsubUrl })
    .split("{{send_id}}").join(encodeURIComponent(recipient.sendId));
  return {
    from: c.from,
    to: recipient.email,
    subject: personalize(c.subject, { shop: c.shop, email: recipient.email, firstName: recipient.firstName, unsubscribeUrl: unsubUrl }),
    html,
    replyTo: c.replyTo,
    headers: listUnsubscribeHeaders(unsubUrl),
    tags: [
      { name: "campaign_id", value: c.id },
      { name: "send_id", value: recipient.sendId },
    ],
  };
}
