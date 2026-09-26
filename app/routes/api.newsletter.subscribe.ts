// app/routes/api.newsletter.subscribe.ts
// Public endpoint — called from storefront popup / post-purchase thank-you page.
// NEW FILE.

import { json, type ActionFunctionArgs } from "@remix-run/node";
import db from "~/db.server";
import { subscribeEmail } from "~/services/newsletter.server";

// Public endpoint, so keep bots from filling lists: only shops that have the
// app installed, and a per-IP rate limit (per server machine, which is enough
// to stop scripted floods).
const WINDOW_MS = 10 * 60 * 1000;
const MAX_PER_WINDOW = 8;
const hits = new Map<string, { count: number; start: number }>();

function rateLimited(key: string) {
  const now = Date.now();
  const h = hits.get(key);
  if (!h || now - h.start > WINDOW_MS) {
    hits.set(key, { count: 1, start: now });
    if (hits.size > 50_000) hits.clear();
    return false;
  }
  h.count++;
  return h.count > MAX_PER_WINDOW;
}

const installedCache = new Map<string, { ok: boolean; at: number }>();
async function isInstalledShop(shop: string) {
  if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i.test(shop)) return false;
  const c = installedCache.get(shop);
  if (c && Date.now() - c.at < 10 * 60 * 1000) return c.ok;
  const session = await db.session.findFirst({ where: { shop }, select: { id: true } }).catch(() => null);
  installedCache.set(shop, { ok: !!session, at: Date.now() });
  return !!session;
}

function corsHeaders(origin: string | null) {
  const allowed =
    origin &&
    (origin.endsWith(".myshopify.com") ||
      origin.endsWith(".shopify.com") ||
      origin.endsWith(".fly.dev"));

  return {
    "Access-Control-Allow-Origin": allowed ? origin! : "*",
    "Access-Control-Allow-Methods": "POST,OPTIONS",
    "Access-Control-Allow-Headers": "content-type",
    "Access-Control-Max-Age": "86400",
  };
}

export async function loader({ request }: ActionFunctionArgs) {
  // Handle preflight
  const origin = request.headers.get("origin");
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }
  return json({ ok: false, error: "Method not allowed" }, { status: 405 });
}

export async function action({ request }: ActionFunctionArgs) {
  const origin = request.headers.get("origin");

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }

  try {
    const body = await request.json().catch(() => ({}));

    const shop = (body?.shop as string | undefined)?.trim();
    const email = (body?.email as string | undefined)?.trim();

    if (!shop || !email) {
      return json(
        { ok: false, error: "Missing shop or email" },
        { status: 400, headers: corsHeaders(origin) }
      );
    }

    // Honeypot: the widget renders a hidden "website" field people never fill in.
    if (body?.website) {
      return json({ ok: true, created: false }, { headers: corsHeaders(origin) });
    }

    const ip =
      request.headers.get("fly-client-ip") ||
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      "unknown";
    if (rateLimited(ip)) {
      return json(
        { ok: false, error: "Too many attempts. Please try again in a few minutes." },
        { status: 429, headers: corsHeaders(origin) }
      );
    }

    if (!(await isInstalledShop(shop))) {
      return json({ ok: false, error: "Unknown store" }, { status: 404, headers: corsHeaders(origin) });
    }

    const result = await subscribeEmail({
      shop,
      email,
      firstName: body?.firstName,
      lastName: body?.lastName,
      source: body?.source || "popup",
      utmSource: body?.utm_source,
      utmMedium: body?.utm_medium,
      utmCampaign: body?.utm_campaign,
      gclid: body?.gclid,
      fbclid: body?.fbclid,
      ip: ip === "unknown" ? null : ip,
    });

    return json(result, { headers: corsHeaders(origin) });
  } catch (err: any) {
    return json(
      { ok: false, error: err?.message || "Server error" },
      { status: 500, headers: corsHeaders(origin) }
    );
  }
}
