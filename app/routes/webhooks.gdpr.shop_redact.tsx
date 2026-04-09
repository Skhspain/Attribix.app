// app/routes/webhooks.gdpr.shop_redact.tsx
// Mandatory GDPR compliance webhook — shop/redact
// Shopify sends this 48 hours after a shop uninstalls the app,
// requesting deletion of all shop data.
import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import shopify from "~/shopify.server";
import { db } from "~/db.server";

export async function action({ request }: ActionFunctionArgs) {
  // authenticate.webhook must be OUTSIDE try-catch so HMAC failures
  // propagate as a proper 400 Response rather than being caught as 500.
  const { shop, payload } = await shopify.authenticate.webhook(request);

  console.log(`[gdpr] shop/redact received for shop: ${shop}`);

  try {
    const anyDb = db as any;

    // Delete all shop data across every table
    await Promise.allSettled([
      anyDb.trackedEvent?.deleteMany?.({ where: { shop } }),
      anyDb.purchase?.deleteMany?.({ where: { shop } }),
      anyDb.touchpoint?.deleteMany?.({ where: { shop } }),
      anyDb.purchaseTouchpoint?.deleteMany?.({ where: { shop } }),
      anyDb.adSpendDaily?.deleteMany?.({ where: { shop } }),
      anyDb.trackingSettings?.deleteMany?.({ where: { shop } }),
      anyDb.metaConnection?.deleteMany?.({ where: { shop } }),
      anyDb.metaCampaignDailyInsight?.deleteMany?.({ where: { shop } }),
      anyDb.metaAdDailyInsight?.deleteMany?.({ where: { shop } }),
      anyDb.googleConnection?.deleteMany?.({ where: { shop } }),
      anyDb.newsletterSettings?.deleteMany?.({ where: { shop } }),
      anyDb.newsletterSubscriber?.deleteMany?.({ where: { shop } }),
      anyDb.newsletterCampaign?.deleteMany?.({ where: { shop } }),
      anyDb.newsletterImage?.deleteMany?.({ where: { shop } }),
      anyDb.lead?.deleteMany?.({ where: { shop } }),
      anyDb.review?.deleteMany?.({ where: { shop } }),
      anyDb.reviewSettings?.deleteMany?.({ where: { shop } }),
      anyDb.reviewWidgetSettings?.deleteMany?.({ where: { shop } }),
      anyDb.automationFlow?.deleteMany?.({ where: { shop } }),
      anyDb.automationEnrollment?.deleteMany?.({ where: { shop } }),
      anyDb.customerSegment?.deleteMany?.({ where: { shop } }),
      anyDb.customDashboard?.deleteMany?.({ where: { shop } }),
      anyDb.session?.deleteMany?.({ where: { shop } }),
    ]);

    console.log(`[gdpr] shop/redact completed for shop: ${shop}`);
  } catch (err: any) {
    console.error("[gdpr] shop_redact processing error:", err?.message);
  }

  return json({ ok: true });
}
