// app/routes/app.webhooks.orders_create.ts
import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import crypto from "node:crypto";
import { authenticate } from "~/shopify.server";

/**
 * Meta CAPI env
 */
const FB_ENABLED = String(process.env.FB_ENABLED || "0") === "1";
const FB_PIXEL_ID = String(process.env.FB_PIXEL_ID || "");
const FB_ACCESS_TOKEN = String(process.env.FB_ACCESS_TOKEN || "");
const FB_TEST_EVENT_CODE = String(process.env.FB_TEST_EVENT_CODE || "").trim();

// NOTE: Keep this route Node (needed for crypto).
export const runtime = "nodejs";

/**
 * Helpers
 */
function sha256Hex(input: string) {
  return crypto.createHash("sha256").update(input).digest("hex");
}
function norm(s?: string | null) {
  return String(s || "").trim().toLowerCase();
}
function hashIfPresent(s?: string | null) {
  const v = norm(s);
  return v ? sha256Hex(v) : undefined;
}

function moneyToNumber(value: any): number {
  // Shopify may send strings like "220.00"
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

async function sendMetaCapiEvent(args: {
  pixelId: string;
  accessToken: string;
  testEventCode?: string;
  eventName: string;
  eventId: string;
  eventTime: number;
  actionSource: "website";
  eventSourceUrl?: string;
  userData: Record<string, any>;
  customData?: Record<string, any>;
}) {
  const {
    pixelId,
    accessToken,
    testEventCode,
    eventName,
    eventId,
    eventTime,
    actionSource,
    eventSourceUrl,
    userData,
    customData,
  } = args;

  const payload: any = {
    data: [
      {
        event_name: eventName,
        event_time: eventTime,
        event_id: eventId,
        action_source: actionSource,
        ...(eventSourceUrl ? { event_source_url: eventSourceUrl } : {}),
        user_data: userData,
        ...(customData ? { custom_data: customData } : {}),
      },
    ],
    access_token: accessToken,
  };

  // If you set FB_TEST_EVENT_CODE, Meta will show it under "Test Events"
  if (testEventCode) payload.test_event_code = testEventCode;

  const url = `https://graph.facebook.com/v20.0/${encodeURIComponent(pixelId)}/events`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });

  const text = await res.text();
  let data: any = null;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }

  return { ok: res.ok, status: res.status, data };
}

export async function action({ request }: ActionFunctionArgs) {
  // Shopify webhook auth + parsing
  const { topic, shop, payload } = await authenticate.webhook(request);

  // Loud log so you can see it in fly logs
  console.log(`[orders_create] webhook received`, {
    topic,
    shop,
    fbEnabled: FB_ENABLED,
    hasPixelId: Boolean(FB_PIXEL_ID),
    hasAccessToken: Boolean(FB_ACCESS_TOKEN),
    hasTestEventCode: Boolean(FB_TEST_EVENT_CODE),
  });

  // Always ACK webhook quickly
  // (but we still run our logic; we just never throw hard errors)
  try {
    // Basic order fields (Shopify Order webhook payload)
    const order: any = payload;

    const orderId = String(order?.id || "");
    const orderName = String(order?.name || "");
    const currency = String(order?.currency || "USD");

    // Shopify often uses total_price as string
    const value = moneyToNumber(order?.total_price ?? order?.current_total_price ?? 0);

    // Build CAPI event_id for dedupe (stable + unique)
    const eventId = orderId || orderName || `order_${Date.now()}`;

    // Event time: prefer Shopify created_at if present
    const eventTime =
      order?.created_at
        ? Math.floor(new Date(order.created_at).getTime() / 1000)
        : Math.floor(Date.now() / 1000);

    // Best-effort event_source_url
    // - landing_site / landing_site_ref may exist
    // - order_status_url may exist
    const eventSourceUrl =
      order?.order_status_url ||
      order?.landing_site ||
      order?.landing_site_ref ||
      undefined;

    // User data (HASHED) — Meta requires SHA256 for email/phone
    const userData: Record<string, any> = {
      em: hashIfPresent(order?.email),
      ph: hashIfPresent(order?.phone),
    };

    // If address exists, hash city/state/zip/country too (optional)
    const addr = order?.billing_address || order?.customer?.default_address || null;
    if (addr) {
      const ct = hashIfPresent(addr?.city);
      const st = hashIfPresent(addr?.province || addr?.province_code);
      const zp = hashIfPresent(addr?.zip);
      const country = hashIfPresent(addr?.country || addr?.country_code);
      if (ct) userData.ct = ct;
      if (st) userData.st = st;
      if (zp) userData.zp = zp;
      if (country) userData.country = country;
    }

    // Custom data for Purchase
    const lineItems: any[] = Array.isArray(order?.line_items) ? order.line_items : [];
    const contents = lineItems
      .map((li) => ({
        id: String(li?.product_id || li?.sku || li?.variant_id || ""),
        quantity: Number(li?.quantity || 1),
        item_price: moneyToNumber(li?.price || 0),
      }))
      .filter((c) => c.id || c.quantity);

    const customData: Record<string, any> = {
      currency,
      value,
      content_type: "product",
      ...(contents.length ? { contents } : {}),
      // You can add order_number for debugging
      ...(orderName ? { order_name: orderName } : {}),
    };

    if (!FB_ENABLED) {
      console.log(`[orders_create] FB disabled (FB_ENABLED!=1). Skipping CAPI.`);
      return json({ ok: true });
    }

    if (!FB_PIXEL_ID || !FB_ACCESS_TOKEN) {
      console.log(`[orders_create] Missing FB_PIXEL_ID or FB_ACCESS_TOKEN. Skipping CAPI.`, {
        hasPixelId: Boolean(FB_PIXEL_ID),
        hasAccessToken: Boolean(FB_ACCESS_TOKEN),
      });
      return json({ ok: true });
    }

    // Send Purchase to Meta
    const capiRes = await sendMetaCapiEvent({
      pixelId: FB_PIXEL_ID,
      accessToken: FB_ACCESS_TOKEN,
      testEventCode: FB_TEST_EVENT_CODE || undefined,
      eventName: "Purchase",
      eventId,
      eventTime,
      actionSource: "website",
      eventSourceUrl,
      userData,
      customData,
    });

    console.log(`[orders_create] Meta CAPI response`, {
      ok: capiRes.ok,
      status: capiRes.status,
      data: capiRes.data,
      eventId,
      value,
      currency,
    });
  } catch (err: any) {
    console.error(`[orders_create] handler error (still returning 200)`, {
      message: err?.message,
      stack: err?.stack,
    });
  }

  return json({ ok: true });
}
