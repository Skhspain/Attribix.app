import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const action = async ({ request }) => {
  const { topic, shop, payload } = await authenticate.webhook(request);
  console.log(`Received ${topic} webhook for ${shop}`);
  if (process.env.NODE_ENV === "development") {
    console.log(payload);
  }

  const {
    id: order_id,
    total_price,
    currency,
    landing_site,
    email,
    phone,
    created_at,
    client_details = {},
    cart_token,
    checkout_token,
    line_items = [],
  } = payload;

  const { browser_ip: ip, user_agent } = client_details || {};

  let utmSource, utmMedium, utmCampaign;
  if (landing_site) {
    try {
      const url = new URL(landing_site, "https://example.com");
      utmSource = url.searchParams.get("utm_source") || undefined;
      utmMedium = url.searchParams.get("utm_medium") || undefined;
      utmCampaign = url.searchParams.get("utm_campaign") || undefined;
    } catch (e) {
      console.error("Failed to parse landing_site", e);
    }
  }

  const products = Array.isArray(line_items)
    ? line_items.map((item) => ({
        productId: item.product_id ? String(item.product_id) : null,
        productName: item.title,
        quantity: item.quantity ?? 0,
      }))
    : [];

  try {
    await prisma.trackedEvent.create({
      data: {
        eventName: "Purchase",
        url: landing_site,
        utmSource,
        utmMedium,
        utmCampaign,
        shop,
        orderId: order_id ? String(order_id) : null,
        value: total_price ? parseFloat(total_price) : null,
        currency,
        email,
        phone,
        ip,
        userAgent: user_agent,
        sessionId: checkout_token || cart_token || undefined,
        createdAt: created_at ? new Date(created_at) : undefined,
        products: {
          create: products,
        },
      },
    });
  } catch (err) {
    console.error("Failed to persist tracked event", err);
    // Optionally: persist failed webhook for retry
  }

  return new Response("OK", { status: 200 });
};