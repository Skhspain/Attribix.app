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

  const nlSettings = await anyDb.newsletterSettings?.findUnique?.({
    where: { shop },
    select: { resendDomainStatus: true, footerText: true },
  }).catch(() => null);

  const { senderFor, personalize, ensureUnsubscribeFooter, verifiedSendingDomain } = await import("~/services/newsletter.server");
  const sender = senderFor({
    fromName: bodyFromName || campaign.fromName,
    merchantEmail: campaign.fromEmail,
    replyTo: campaign.replyTo,
    verifiedDomain: await verifiedSendingDomain(shop),
    shop,
  });

  // Same preparation as a real send, but the unsubscribe link goes nowhere so a
  // test can't unsubscribe the tester.
  const html = personalize(ensureUnsubscribeFooter(campaign.htmlContent, nlSettings?.footerText ?? ""), {
    shop,
    email: testEmail,
    firstName: "Alex",
    unsubscribeUrl: "#",
  });

  const { sendEmail } = await import("~/services/resend.server");
  const result = await sendEmail({
    from: sender.from,
    to: testEmail,
    subject: `[TEST] ${bodySubject || campaign.subject || "(no subject)"}`,
    html,
    replyTo: sender.replyTo,
  });

  return json(
    result.ok
      ? { ok: true, message: `Test email sent to ${testEmail}` }
      : { ok: false, error: `Send failed: ${(result as any).error}` },
  );
}
