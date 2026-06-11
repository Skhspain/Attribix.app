// app/routes/api.backfill-orders.ts
// One-shot backfill: fetches the last 90 days of Shopify orders and creates
// Purchase records for any that aren't already tracked. Triggered manually
// from Settings → General via a POST form submission.

import { json, type ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "~/shopify.server";
import { db } from "~/db.server";

function pickString(x: unknown): string | null {
  return typeof x === "string" && x.trim().length ? x.trim() : null;
}

function pickNumber(x: unknown): number | null {
  if (typeof x === "number" && Number.isFinite(x)) return x;
  if (typeof x === "string") { const n = Number(x); return Number.isFinite(n) ? n : null; }
  return null;
}

function getUtmAndClickIds(url: string | null) {
  try {
    if (!url) return {};
    const u = new URL(url);
    return {
      utmSource:   u.searchParams.get("utm_source"),
      utmMedium:   u.searchParams.get("utm_medium"),
      utmCampaign: u.searchParams.get("utm_campaign"),
      fbclid:      u.searchParams.get("fbclid"),
      gclid:       u.searchParams.get("gclid"),
      ttclid:      u.searchParams.get("ttclid"),
      msclkid:     u.searchParams.get("msclkid"),
    };
  } catch {
    return {};
  }
}

export async function action({ request }: ActionFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();

  let created = 0;
  let skipped = 0;
  let pageInfo: string | null = null;
  let page = 0;
  const MAX_PAGES = 10;

  try {
    while (page < MAX_PAGES) {
      page++;

      // Shopify REST: GET /admin/api/2024-01/orders.json
      const params = new URLSearchParams({
        created_at_min: since,
        limit: "250",
        status: "any",
        fields: "id,current_total_price,currency,created_at,landing_site,referring_site,email,customer,billing_address,note_attributes",
        ...(pageInfo ? { page_info: pageInfo } : {}),
      });

      const res = await fetch(
        `https://${shop}/admin/api/2024-01/orders.json?${params}`,
        { headers: { "X-Shopify-Access-Token": session.accessToken } },
      );

      if (!res.ok) break;

      const { orders } = await res.json() as { orders: any[] };
      if (!orders?.length) break;

      for (const order of orders) {
        const orderId = pickString(order?.id?.toString());
        if (!orderId) continue;

        const existing = await db.purchase.findUnique({ where: { orderId } });
        if (existing) { skipped++; continue; }

        const totalValue = pickNumber(order.current_total_price) ?? 0;
        const currency = pickString(order.currency) ?? "USD";
        const createdAt = new Date(order.created_at || Date.now());

        const landingUrl = pickString(order.landing_site);
        const referrer = pickString(order.referring_site);
        const attrs = getUtmAndClickIds(landingUrl);

        const country =
          pickString(order.billing_address?.country_code) ?? null;
        const city =
          pickString(order.billing_address?.city) ?? null;

        const firstName = pickString(order.customer?.first_name) ?? null;
        const lastName = pickString(order.customer?.last_name) ?? null;
        const customerName = firstName || lastName
          ? `${firstName ?? ""} ${lastName ?? ""}`.trim()
          : null;

        // Recover visitorId/sessionId from note_attributes if our tracker set them
        const noteAttrs: any[] = Array.isArray(order.note_attributes) ? order.note_attributes : [];
        const findNote = (name: string) =>
          noteAttrs.find((a: any) => String(a?.name ?? "").toLowerCase() === name)?.value ?? null;
        const visitorId = findNote("attribix_visitor_id") || findNote("visitorid");
        const sessionId = findNote("attribix_session_id") || findNote("sessionid");

        await db.purchase.create({
          data: {
            createdAt,
            totalValue,
            currency,
            shop,
            orderId,
            visitorId,
            sessionId,
            customerName,
            country,
            city,
            referrer,
            landingPage: landingUrl,
            utmSource:   attrs.utmSource   ?? null,
            utmMedium:   attrs.utmMedium   ?? null,
            utmCampaign: attrs.utmCampaign ?? null,
            fbclid:      attrs.fbclid      ?? null,
            gclid:       attrs.gclid       ?? null,
            ttclid:      attrs.ttclid      ?? null,
            msclkid:     attrs.msclkid     ?? null,
          },
        }).catch(() => null);

        created++;
      }

      // Check for next page via Link header
      const link = res.headers.get("link") ?? "";
      const nextMatch = link.match(/<[^>]+page_info=([^&>]+)[^>]*>;\s*rel="next"/);
      if (!nextMatch) break;
      pageInfo = nextMatch[1];
    }
  } catch (err: any) {
    return json({ ok: false, error: err?.message ?? "backfill failed" }, { status: 500 });
  }

  console.log(`[backfill] ${shop}: created=${created} skipped=${skipped}`);
  return json({ ok: true, created, skipped });
}
