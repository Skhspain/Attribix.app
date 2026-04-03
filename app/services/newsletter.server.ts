// app/services/newsletter.server.ts
// Core newsletter business logic: subscribers, campaigns, sending, unsubscribe tokens.
// NEW FILE — does not touch any existing code.

import crypto from "node:crypto";
import db from "~/db.server";
import { sendEmailBatch, buildUnsubscribeFooter, type BatchEmailItem } from "~/services/resend.server";

// ─── Unsubscribe token ────────────────────────────────────────────────────────

const UNSUB_SECRET = process.env.NEWSLETTER_UNSUB_SECRET || "attribix-unsub-secret-change-me";

export function generateUnsubscribeToken(shop: string, email: string): string {
  const payload = `${shop}:${email}`;
  const sig = crypto.createHmac("sha256", UNSUB_SECRET).update(payload).digest("hex");
  return Buffer.from(`${payload}:${sig}`).toString("base64url");
}

export function verifyUnsubscribeToken(token: string): { shop: string; email: string } | null {
  try {
    const decoded = Buffer.from(token, "base64url").toString("utf8");
    const lastColon = decoded.lastIndexOf(":");
    if (lastColon < 0) return null;

    const payload = decoded.slice(0, lastColon);
    const sig = decoded.slice(lastColon + 1);
    const expected = crypto.createHmac("sha256", UNSUB_SECRET).update(payload).digest("hex");

    if (sig !== expected) return null;

    const firstColon = payload.indexOf(":");
    if (firstColon < 0) return null;

    const shop = payload.slice(0, firstColon);
    const email = payload.slice(firstColon + 1);
    return { shop, email };
  } catch {
    return null;
  }
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
}): Promise<{ ok: boolean; created: boolean; message?: string }> {
  const email = args.email.toLowerCase().trim();

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, created: false, message: "Invalid email address" };
  }

  try {
    const existing = await db.newsletterSubscriber.findUnique({
      where: { shop_email: { shop: args.shop, email } },
    });

    if (existing) {
      if (existing.status === "unsubscribed") {
        // Re-subscribe
        await db.newsletterSubscriber.update({
          where: { shop_email: { shop: args.shop, email } },
          data: { status: "subscribed", unsubscribedAt: null },
        });
        return { ok: true, created: false, message: "Re-subscribed" };
      }
      return { ok: true, created: false, message: "Already subscribed" };
    }

    await db.newsletterSubscriber.create({
      data: {
        shop: args.shop,
        email,
        firstName: args.firstName ?? null,
        lastName: args.lastName ?? null,
        status: "subscribed",
        source: args.source ?? "manual",
        utmSource: args.utmSource ?? null,
        utmMedium: args.utmMedium ?? null,
        utmCampaign: args.utmCampaign ?? null,
        gclid: args.gclid ?? null,
        fbclid: args.fbclid ?? null,
      },
    });

    return { ok: true, created: true };
  } catch (err: any) {
    console.error(`[newsletter] subscribeEmail error: ${err?.message}`);
    return { ok: false, created: false, message: err?.message };
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
  createdAfter?: Date;
  createdBefore?: Date;
};

export async function getSubscribersForSegment(
  shop: string,
  filter?: SegmentFilter
): Promise<Array<{ email: string; firstName: string | null; lastName: string | null }>> {
  const where: any = { shop, status: "subscribed" };

  if (filter?.utmSource) where.utmSource = filter.utmSource;
  if (filter?.utmMedium) where.utmMedium = filter.utmMedium;
  if (filter?.utmCampaign) where.utmCampaign = filter.utmCampaign;
  if (filter?.source) where.source = filter.source;
  if (filter?.createdAfter || filter?.createdBefore) {
    where.createdAt = {};
    if (filter.createdAfter) where.createdAt.gte = filter.createdAfter;
    if (filter.createdBefore) where.createdAt.lte = filter.createdBefore;
  }

  return db.newsletterSubscriber.findMany({
    where,
    select: { email: true, firstName: true, lastName: true },
    orderBy: { createdAt: "desc" },
  });
}

export async function countSubscribersForSegment(
  shop: string,
  filter?: SegmentFilter
): Promise<number> {
  const where: any = { shop, status: "subscribed" };
  if (filter?.utmSource) where.utmSource = filter.utmSource;
  if (filter?.utmMedium) where.utmMedium = filter.utmMedium;
  if (filter?.utmCampaign) where.utmCampaign = filter.utmCampaign;
  if (filter?.source) where.source = filter.source;

  return db.newsletterSubscriber.count({ where });
}

// ─── Campaign sending ─────────────────────────────────────────────────────────

const APP_URL = process.env.SHOPIFY_APP_URL || "https://attribix-app.fly.dev";

export async function sendCampaign(campaignId: string): Promise<{
  ok: boolean;
  sent: number;
  failed: number;
  errors: string[];
  message?: string;
}> {
  const anyDb = db as any;

  const campaign = await anyDb.newsletterCampaign.findUnique({
    where: { id: campaignId },
  });

  if (!campaign) return { ok: false, sent: 0, failed: 0, errors: ["Campaign not found"] };
  if (!campaign.htmlContent) return { ok: false, sent: 0, failed: 0, errors: ["Campaign has no HTML content — save the design first"] };
  if (campaign.status === "sent") return { ok: false, sent: 0, failed: 0, errors: ["Campaign already sent"] };

  // ── Monthly send limit check ──────────────────────────────────────────────
  {
    const settings = await anyDb.newsletterSettings?.findUnique?.({
      where: { shop: campaign.shop },
    }).catch(() => null);
    const limit: number = settings?.monthlyEmailLimit ?? 500;

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    const sentCampaigns = await anyDb.newsletterCampaign.findMany({
      where: {
        shop: campaign.shop,
        status: "sent",
        sentAt: { gte: monthStart, lt: monthEnd },
      },
      select: { recipientCount: true },
    }).catch(() => [] as Array<{ recipientCount: number }>);

    const emailsSentThisMonth: number = sentCampaigns.reduce(
      (sum: number, c: { recipientCount: number }) => sum + (c.recipientCount ?? 0),
      0
    );

    // Count how many subscribers this campaign would send to
    const segmentFilter: SegmentFilter = campaign.segmentFilter ?? {};
    const plannedCount = await countSubscribersForSegment(campaign.shop, segmentFilter);

    if (emailsSentThisMonth + plannedCount > limit) {
      // Revert status back to draft so it can be retried
      await anyDb.newsletterCampaign.update({
        where: { id: campaignId },
        data: { status: "draft" },
      }).catch(() => null);
      return {
        ok: false,
        sent: 0,
        failed: 0,
        errors: [
          `Monthly email limit reached (${limit} emails/month). Upgrade your plan for more sends.`,
        ],
      };
    }
  }

  // Mark as sending
  await anyDb.newsletterCampaign.update({
    where: { id: campaignId },
    data: { status: "sending" },
  });

  const segmentFilter: SegmentFilter = campaign.segmentFilter ?? {};
  const subscribers = await getSubscribersForSegment(campaign.shop, segmentFilter);

  if (subscribers.length === 0) {
    await anyDb.newsletterCampaign.update({
      where: { id: campaignId },
      data: { status: "sent", sentAt: new Date(), recipientCount: 0 },
    });
    return { ok: true, sent: 0, failed: 0, errors: [], message: "No subscribers matched the segment" };
  }

  const fromName = campaign.fromName || "Newsletter";
  const fromEmail = campaign.fromEmail || process.env.SMTP_FROM_EMAIL || "newsletters@attribix.email";
  const from = `${fromName} <${fromEmail}>`;

  const emails: BatchEmailItem[] = subscribers.map((sub) => {
    const token = generateUnsubscribeToken(campaign.shop, sub.email);
    const unsubUrl = `${APP_URL}/newsletter/unsubscribe?token=${token}`;
    const footer = buildUnsubscribeFooter(unsubUrl);

    // Personalise: replace {{first_name}} placeholders
    const firstName = sub.firstName || "";
    let html = campaign.htmlContent
      .replace(/\{\{first_name\}\}/gi, firstName)
      .replace(/\{\{email\}\}/gi, sub.email);

    // Wrap all http(s) links with click-tracking redirect (skip mailto: and #)
    html = html.replace(
      /href="(https?:\/\/[^"]+)"/g,
      (_, url) =>
        `href="${APP_URL}/api/newsletter/track?type=click&cid=${campaignId}&url=${encodeURIComponent(url)}"`
    );

    // Open-tracking pixel
    const openPixel = `<img src="${APP_URL}/api/newsletter/track?type=open&cid=${campaignId}" width="1" height="1" alt="" style="display:block;width:1px;height:1px;border:0;padding:0;margin:0;">`;

    // Inject unsubscribe footer and open pixel before </body> if present, otherwise append
    if (html.includes("</body>")) {
      html = html.replace("</body>", `${footer}${openPixel}</body>`);
    } else {
      html += footer + openPixel;
    }

    return {
      from,
      to: sub.email,
      subject: campaign.subject,
      html,
      replyTo: campaign.replyTo || undefined,
      tags: [
        { name: "campaign_id", value: campaignId },
        { name: "shop", value: campaign.shop },
      ],
    };
  });

  const { sent, failed, errors } = await sendEmailBatch(emails);

  await anyDb.newsletterCampaign.update({
    where: { id: campaignId },
    data: {
      status: failed === emails.length ? "failed" : "sent",
      sentAt: new Date(),
      recipientCount: subscribers.length,
      deliveredCount: sent,
    },
  });

  console.log(`[newsletter] Campaign ${campaignId} sent: ${sent} delivered, ${failed} failed`);
  return { ok: true, sent, failed, errors };
}
