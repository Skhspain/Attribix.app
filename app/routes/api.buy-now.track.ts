// app/routes/api.buy-now.track.ts
// Public endpoint called from the storefront Buy Now button click handler.
// Stores click with full attribution context.
// NEW FILE.

import { json, type ActionFunctionArgs } from "@remix-run/node";

function cors(origin: string | null) {
  const allowed = origin && (
    origin.endsWith(".myshopify.com") ||
    origin.endsWith(".shopify.com") ||
    origin.endsWith(".fly.dev")
  );
  return {
    "Access-Control-Allow-Origin": allowed ? origin! : "*",
    "Access-Control-Allow-Methods": "POST,OPTIONS",
    "Access-Control-Allow-Headers": "content-type",
    "Access-Control-Max-Age": "86400",
  };
}

export async function loader({ request }: ActionFunctionArgs) {
  const origin = request.headers.get("origin");
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors(origin) });
  }
  return json({ ok: false }, { status: 405, headers: cors(origin) });
}

export async function action({ request }: ActionFunctionArgs) {
  const origin = request.headers.get("origin");

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors(origin) });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const shop = (body?.shop as string | undefined)?.trim();
    if (!shop) {
      return json({ ok: false, error: "Missing shop" }, { status: 400, headers: cors(origin) });
    }

    const { db } = await import("~/db.server");
    const anyDb = db as any;

    await anyDb.buyNowClick?.create?.({
      data: {
        shop,
        productId: body?.productId ? String(body.productId) : null,
        variantId: body?.variantId ? String(body.variantId) : null,
        url: body?.url ? String(body.url).slice(0, 2000) : null,
        referrer: body?.referrer ? String(body.referrer).slice(0, 2000) : null,
        visitorId: body?.visitorId ? String(body.visitorId).slice(0, 100) : null,
        sessionId: body?.sessionId ? String(body.sessionId).slice(0, 100) : null,
        gclid: body?.gclid ? String(body.gclid).slice(0, 200) : null,
        fbclid: body?.fbclid ? String(body.fbclid).slice(0, 200) : null,
        ttclid: body?.ttclid ? String(body.ttclid).slice(0, 200) : null,
        utmSource: body?.utm_source ? String(body.utm_source).slice(0, 100) : null,
        utmMedium: body?.utm_medium ? String(body.utm_medium).slice(0, 100) : null,
        utmCampaign: body?.utm_campaign ? String(body.utm_campaign).slice(0, 200) : null,
      },
    });

    return json({ ok: true }, { headers: cors(origin) });
  } catch (err: any) {
    console.error("[buy-now track]", err?.message);
    return json({ ok: false, error: "Server error" }, { status: 500, headers: cors(origin) });
  }
}
