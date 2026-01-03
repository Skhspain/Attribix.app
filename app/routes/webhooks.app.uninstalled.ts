import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import crypto from "crypto";
import prisma from "~/db.server";

// Optional: verify webhook HMAC (recommended)
function verifyShopifyWebhookHmac(rawBody: string, hmacHeader: string | null) {
  const secret = process.env.SHOPIFY_API_SECRET;
  if (!secret || !hmacHeader) return false;

  const digest = crypto
    .createHmac("sha256", secret)
    .update(rawBody, "utf8")
    .digest("base64");

  // timing safe compare
  const a = Buffer.from(digest, "utf8");
  const b = Buffer.from(hmacHeader, "utf8");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export async function action({ request }: ActionFunctionArgs) {
  try {
    const rawBody = await request.text();

    // If you want to enforce HMAC now, flip this to true.
    const ENFORCE_HMAC = true;

    const hmacHeader =
      request.headers.get("x-shopify-hmac-sha256") ||
      request.headers.get("X-Shopify-Hmac-Sha256");

    if (ENFORCE_HMAC) {
      const ok = verifyShopifyWebhookHmac(rawBody, hmacHeader);
      if (!ok) return json({ ok: false }, { status: 401 });
    }

    const payload = rawBody ? JSON.parse(rawBody) : {};
    const shop = payload?.myshopify_domain || payload?.domain;

    if (shop) {
      // Delete all shop-scoped data (adjust as your schema grows)
      await prisma.shopSettings.deleteMany({ where: { shopDomain: shop } });
      await prisma.adDailyStat.deleteMany({ where: { shopId: shop } });
      await prisma.adPlatformConnection.deleteMany({ where: { shopId: shop } });

      await prisma.trackedProduct.deleteMany({
        where: { event: { shop } },
      });
      await prisma.trackedEvent.deleteMany({
        where: { shop },
      });
    }

    return json({ ok: true });
  } catch (e) {
    // Never fail webhooks hard
    return json({ ok: true });
  }
}
