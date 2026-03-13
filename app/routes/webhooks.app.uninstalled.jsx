// app/routes/webhooks.app.uninstalled.jsx
import shopify from "../shopify.server";
import db from "../db.server";

export const action = async ({ request }) => {
  try {
    const { shop /*, payload */ } = await shopify.authenticate.webhook(request);

    if (shop) {
      await Promise.allSettled([
        db.session.deleteMany({ where: { shop } }),
        db.trackingSettings.deleteMany({ where: { shop } }),
        db.metaConnection.deleteMany({ where: { shop } }),
        db.googleConnection.deleteMany({ where: { shop } }),
        db.metaCampaignDailyInsight.deleteMany({ where: { shop } }),
      ]);
    }

    return new Response(null, { status: 200 });
  } catch (error) {
    console.error("[webhooks.app.uninstalled] error", error);
    return new Response(null, { status: 500 });
  }
};