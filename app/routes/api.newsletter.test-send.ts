// app/routes/api.newsletter.test-send.ts
// POST /api/newsletter/test-send
//
// Sends a test copy of a newsletter campaign to one address.
// Authenticated via HMAC token (same pattern as /api/reviews/feed) so the
// client does NOT need a live Shopify session token — this sidesteps the
// App-Bridge session-expiry issue that blocked the action-based approach.
//
// Body: { campaignId, shop, token, testEmail }
// Token = HMAC-SHA256(shop:campaignId, SHOPIFY_API_SECRET).slice(0,32)

import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import db from "~/db.server";

async function makeTestSendToken(shop: string, campaignId: string): Promise<string> {
  const { createHmac } = await import("node:crypto");
  const secret = process.env.SHOPIFY_API_SECRET ?? "fallback";
  return createHmac("sha256", secret)
    .update(`${shop}:${campaignId}`)
    .digest("hex")
    .slice(0, 32);
}

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return json({ ok: false, error: "Method not allowed" }, { status: 405 });
  }

  const body = await request.json().catch(() => ({}));
  const { campaignId, shop, token, testEmail, subject: bodySubject, fromName: bodyFromName, previewText: bodyPreviewText } = body as Record<string, string>;

  if (!campaignId || !shop || !token || !testEmail) {
    return json({ ok: false, error: "Missing required fields" }, { status: 400 });
  }

  const expected = await makeTestSendToken(shop, campaignId);
  if (token !== expected) {
    return json({ ok: false, error: "Invalid token — reload the page and try again" }, { status: 401 });
  }

  if (!process.env.SMTP_HOST) {
    return json({
      ok: false,
      error: "Email sending is not configured (SMTP_HOST missing). Contact support.",
    });
  }

  const anyDb = db as any;
  const campaign = await anyDb.newsletterCampaign?.findUnique?.({ where: { id: campaignId } });

  if (!campaign || campaign.shop !== shop) {
    return json({ ok: false, error: "Campaign not found" }, { status: 404 });
  }

  if (!campaign.htmlContent) {
    return json({ ok: false, error: "No email content yet — design your email first, then send a test." });
  }

  const anyDb2 = db as any;
  const nlSettings = await anyDb2.newsletterSettings?.findUnique?.({
    where: { shop },
    select: { resendDomainStatus: true },
  }).catch(() => null);
  const domainVerified = nlSettings?.resendDomainStatus === "verified";

  const fromName = bodyFromName || campaign.fromName || "Newsletter";
  // Use merchant's domain if verified; otherwise fall back to shared sending domain
  const campaignFromEmail = bodyFromName ? (campaign.fromEmail || "") : campaign.fromEmail;
  const fromEmail = domainVerified && campaignFromEmail
    ? campaignFromEmail
    : process.env.SMTP_FROM_EMAIL || "";
  if (!fromEmail) {
    return json({
      ok: false,
      error: "Sender email not configured. Contact support to enable sending.",
    });
  }
  const replyTo = campaign.replyTo || (domainVerified ? undefined : campaign.fromEmail) || undefined;

  const shopDomain = shop.replace(".myshopify.com", "");
  const html = campaign.htmlContent
    .replace(/\{\{first_name\}\}/gi, "Test Subscriber")
    .replace(/\{\{name\}\}/gi, "Test Subscriber")
    .replace(/\{\{email\}\}/gi, testEmail)
    .replace(/\{\{shop_url\}\}/gi, `https://${shop}`)
    .replace(/\{\{shop\}\}/gi, shopDomain)
    .replace(/\{\{unsubscribe_url\}\}/gi, "#");

  const { sendEmail } = await import("~/services/resend.server");
  const result = await sendEmail({
    from: `${fromName} <${fromEmail}>`,
    to: testEmail,
    subject: `[TEST] ${bodySubject || campaign.subject || "(no subject)"}`,
    html,
    replyTo,
  });

  return json(
    result.ok
      ? { ok: true, message: `Test email sent to ${testEmail}` }
      : { ok: false, error: `Send failed: ${(result as any).error}` },
  );
}
