// app/routes/api.track.ts
import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import crypto from "node:crypto";

type PixelEvent = {
  event: string; // purchase, add_to_cart, product_viewed, page_viewed, ...
  occurred_at?: string;
  shop_domain?: string; // web pixel should send this
  customer?: { email?: string; id?: string };
  order?: { id?: string; number?: string; currency?: string; value?: number };
  items?: Array<{ id?: string; sku?: string; title?: string; quantity?: number; price?: number }>;
  page?: { url?: string; referrer?: string };
};

function sha256Fallback(str: string) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return String(hash);
}

function hashEmailForMeta(email?: string) {
  if (!email) return undefined;
  const norm = email.trim().toLowerCase();
  return crypto.createHash("sha256").update(norm).digest("hex");
}

async function sendToGA4(
  e: PixelEvent,
  ga4Id?: string | null,
  ga4Secret?: string | null,
  userAgent?: string
) {
  if (!ga4Id || !ga4Secret) return;

  const params = new URLSearchParams({
    measurement_id: ga4Id,
    api_secret: ga4Secret,
  });

  const clientId =
    (e.customer?.id && `shopify_${e.customer.id}`) ||
    sha256Fallback(`${e.shop_domain}:${e.customer?.email || "anon"}`);

  const gaEventName =
    e.event === "purchase"
      ? "purchase"
      : e.event === "add_to_cart"
      ? "add_to_cart"
      : e.event === "product_viewed"
      ? "view_item"
      : "page_view";

  const items = (e.items || []).map((it, idx) => ({
    item_id: it.sku || it.id || `item_${idx}`,
    item_name: it.title,
    quantity: it.quantity || 1,
    price: it.price,
  }));

  const body = {
    client_id: clientId,
    user_agent: userAgent,
    timestamp_micros: Date.now() * 1000,
    events: [
      {
        name: gaEventName,
        params: {
          currency: e.order?.currency || "USD",
          value: e.order?.value,
          page_location: e.page?.url,
          page_referrer: e.page?.referrer,
          items,
        },
      },
    ],
  };

  await fetch(`https://www.google-analytics.com/mp/collect?${params.toString()}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).catch(() => {});
}

async function sendToMeta(
  e: PixelEvent,
  fbPixelId?: string | null,
  fbToken?: string | null,
  userAgent?: string,
  sourceIp?: string
) {
  if (!fbPixelId || !fbToken) return;

  const metaEventName =
    e.event === "purchase"
      ? "Purchase"
      : e.event === "add_to_cart"
      ? "AddToCart"
      : e.event === "product_viewed"
      ? "ViewContent"
      : "PageView";

  const contents = (e.items || []).map((it) => ({
    id: it.sku || it.id,
    quantity: it.quantity || 1,
    item_price: it.price,
  }));

  const payload = {
    data: [
      {
        event_name: metaEventName,
        event_time: Math.floor(Date.now() / 1000),
        event_source_url: e.page?.url,
        action_source: "website",
        user_data: {
          em: e.customer?.email ? [hashEmailForMeta(e.customer.email)] : undefined,
          client_user_agent: userAgent,
          client_ip_address: sourceIp,
        },
        custom_data: {
          currency: e.order?.currency || "USD",
          value: e.order?.value,
          contents,
          content_type: "product",
        },
      },
    ],
    access_token: fbToken,
  };

  await fetch(`https://graph.facebook.com/v18.0/${fbPixelId}/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }).catch(() => {});
}

export async function action({ request }: ActionFunctionArgs) {
  // CORS preflight
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }

  const ua = request.headers.get("user-agent") || undefined;
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("fly-client-ip") ||
    undefined;

  let event: PixelEvent | undefined;
  try {
    event = await request.json();
  } catch {
    return json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  if (!event?.event) {
    return json({ ok: false, error: "Missing event" }, { status: 400 });
  }

  const shop =
    event.shop_domain ||
    new URL(request.url).searchParams.get("shop") ||
    ""; // fallback if you post with ?shop=

  if (!shop) {
    return json({ ok: false, error: "Missing shop_domain" }, { status: 400 });
  }

  const { getTrackingSettings } = await import("~/models/trackingSettings.server");
  const s = await getTrackingSettings(shop);

  await Promise.all([
    sendToGA4(event, s?.ga4Id, s?.ga4Secret, ua),
    sendToMeta(event, s?.fbPixelId, s?.fbToken, ua, ip),
  ]);

  return json({ ok: true });
}

export function loader() {
  return new Response("Not found", { status: 404 });
}
