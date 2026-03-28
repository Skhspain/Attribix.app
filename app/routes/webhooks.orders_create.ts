// app/routes/webhooks.orders_create.ts
//
// Attribution pipeline: when a Shopify order comes in, find the web session
// that led to it and record the UTM source alongside the purchase.
//
// Attribution strategy (in priority order):
//   1. Checkout token match — the pixel sends checkout.token as sessionId on
//      checkout_started. Shopify includes the same token in the order payload
//      as checkout_token. Best match: direct 1-to-1 link.
//   2. Email fallback — if no checkout token match, look for the most recent
//      checkout_started event that recorded the customer's email within 30 days.

import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { createHash } from "crypto";
import shopify from "~/shopify.server";
import { db } from "~/db.server";

function hashEmail(email: string): string {
  return createHash("sha256").update(email.trim().toLowerCase()).digest("hex");
}

export async function action({ request }: ActionFunctionArgs) {
  try {
    const { topic, shop, payload } = await shopify.authenticate.webhook(request);

    if (topic !== "ORDERS_CREATE") {
      return json({ ok: true, skipped: true });
    }

    const order = payload as any;

    const shopifyOrderId = String(order.id);
    const checkoutToken = order.checkout_token as string | null | undefined;
    const customerEmail = (order.email as string | null | undefined)?.trim().toLowerCase() || null;
    const totalPrice = parseFloat(order.total_price || "0");
    const currency = order.currency || "USD";

    // Idempotency: skip if already recorded
    const existing = await db.purchase.findUnique({
      where: { shopifyOrderId },
      select: { id: true },
    });
    if (existing) {
      console.log("[orders_create] already recorded, skipping", shopifyOrderId);
      return json({ ok: true, skipped: true });
    }

    // ── 1. Checkout token match ──────────────────────────────────────────────
    let attributionEvent: {
      utmSource: string | null;
      utmMedium: string | null;
      utmCampaign: string | null;
      gclid: string | null;
      fbclid: string | null;
      sessionId: string | null;
    } | null = null;

    if (checkoutToken) {
      const ev = await db.trackedEvent.findFirst({
        where: {
          sessionId: checkoutToken,
          eventName: { in: ["checkout_started", "checkout_completed"] },
        },
        orderBy: { createdAt: "desc" },
        select: {
          utmSource: true,
          utmMedium: true,
          utmCampaign: true,
          gclid: true,
          fbclid: true,
          sessionId: true,
        },
      });

      if (ev) {
        attributionEvent = ev;
        console.log("[orders_create] attributed via checkout token", checkoutToken);
      }
    }

    // ── 2. Email fallback ────────────────────────────────────────────────────
    if (!attributionEvent && customerEmail) {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

      const ev = await db.trackedEvent.findFirst({
        where: {
          email: customerEmail,
          eventName: { in: ["checkout_started", "checkout_completed"] },
          createdAt: { gte: thirtyDaysAgo },
        },
        orderBy: { createdAt: "desc" },
        select: {
          utmSource: true,
          utmMedium: true,
          utmCampaign: true,
          gclid: true,
          fbclid: true,
          sessionId: true,
        },
      });

      if (ev) {
        attributionEvent = ev;
        console.log("[orders_create] attributed via email fallback", customerEmail);
      }
    }

    if (!attributionEvent) {
      console.log("[orders_create] no attribution found for order", shopifyOrderId);
    }

    // ── Build line items ─────────────────────────────────────────────────────
    const lineItems: Array<{
      productId: string;
      productName: string;
      quantity: number;
      price: number;
    }> = (order.line_items || []).map((item: any) => ({
      productId: String(item.product_id || item.variant_id || "unknown"),
      productName: String(item.title || item.name || "Unknown product"),
      quantity: Number(item.quantity || 1),
      price: parseFloat(item.price || "0"),
    }));

    // ── Persist ──────────────────────────────────────────────────────────────
    const purchase = await db.purchase.create({
      data: {
        shop,
        shopifyOrderId,
        totalValue: totalPrice,
        currency,
        customerEmailHash: customerEmail ? hashEmail(customerEmail) : null,
        utmSource: attributionEvent?.utmSource ?? null,
        utmMedium: attributionEvent?.utmMedium ?? null,
        utmCampaign: attributionEvent?.utmCampaign ?? null,
        gclid: attributionEvent?.gclid ?? null,
        fbclid: attributionEvent?.fbclid ?? null,
        sessionId: attributionEvent?.sessionId ?? null,
        items: {
          create: lineItems,
        },
      },
    });

    console.log("[orders_create] recorded purchase", {
      id: purchase.id,
      shopifyOrderId,
      totalValue: totalPrice,
      utmSource: purchase.utmSource,
      utmMedium: purchase.utmMedium,
      utmCampaign: purchase.utmCampaign,
    });

    return json({ ok: true, purchaseId: purchase.id });
  } catch (err: any) {
    console.error("[orders_create] error:", err?.message ?? err);
    return json({ ok: false, error: String(err?.message ?? err) }, { status: 500 });
  }
}
