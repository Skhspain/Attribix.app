// app/routes/webhooks.app.uninstalled.jsx
// Mandatory webhook — APP_UNINSTALLED.
//
// We clean up everything shop-scoped at t=0. Aligning with shop_redact (which
// Shopify sends 48h later) means we do not retain stale data between the two
// events. This is the safest posture for App Store review.
import shopify from "../shopify.server";
import db from "../db.server";

export const action = async ({ request }) => {
  // authenticate.webhook MUST be called outside any try/catch so HMAC
  // verification failures propagate as 400 rather than being swallowed as 500.
  const { shop } = await shopify.authenticate.webhook(request);

  if (shop) {
    try {
      const anyDb = db;
      await Promise.allSettled([
        // Auth & session
        anyDb.session?.deleteMany?.({ where: { shop } }),

        // Integration tokens & config
        anyDb.trackingSettings?.deleteMany?.({ where: { shop } }),
        anyDb.metaConnection?.deleteMany?.({ where: { shop } }),
        anyDb.googleConnection?.deleteMany?.({ where: { shop } }),
        anyDb.tikTokConnection?.deleteMany?.({ where: { shop } }),
        anyDb.stripeConnection?.deleteMany?.({ where: { shop } }),

        // Attribution / analytics
        anyDb.trackedEvent?.deleteMany?.({ where: { shop } }),
        anyDb.purchase?.deleteMany?.({ where: { shop } }),
        anyDb.touchpoint?.deleteMany?.({ where: { shop } }),
        anyDb.purchaseTouchpoint?.deleteMany?.({ where: { shop } }),
        anyDb.adSpendDaily?.deleteMany?.({ where: { shop } }),
        anyDb.metaCampaignDailyInsight?.deleteMany?.({ where: { shop } }),
        anyDb.metaAdDailyInsight?.deleteMany?.({ where: { shop } }),
        anyDb.tikTokCampaignDailyInsight?.deleteMany?.({ where: { shop } }),
        anyDb.tikTokAdDailyInsight?.deleteMany?.({ where: { shop } }),

        // Newsletter / leads / reviews
        anyDb.newsletterSettings?.deleteMany?.({ where: { shop } }),
        anyDb.newsletterSubscriber?.deleteMany?.({ where: { shop } }),
        anyDb.newsletterCampaign?.deleteMany?.({ where: { shop } }),
        anyDb.newsletterImage?.deleteMany?.({ where: { shop } }),
        anyDb.lead?.deleteMany?.({ where: { shop } }),
        anyDb.review?.deleteMany?.({ where: { shop } }),
        anyDb.reviewSettings?.deleteMany?.({ where: { shop } }),
        anyDb.reviewWidgetSettings?.deleteMany?.({ where: { shop } }),

        // Automations / segments / dashboards
        anyDb.automationFlow?.deleteMany?.({ where: { shop } }),
        anyDb.automationEnrollment?.deleteMany?.({ where: { shop } }),
        anyDb.customerSegment?.deleteMany?.({ where: { shop } }),
        anyDb.customDashboard?.deleteMany?.({ where: { shop } }),
      ]);
      console.log(`[webhooks.app.uninstalled] cleanup completed for shop=${shop}`);
    } catch (error) {
      console.error("[webhooks.app.uninstalled] cleanup error", error);
    }
  }

  return new Response(null, { status: 200 });
};
