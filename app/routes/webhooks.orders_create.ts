// app/routes/webhooks.orders_create.ts
import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { db } from "~/db.server";
import shopify from "~/shopify.server";
import {
  claimPurchaseConversion,
  releasePurchaseConversion,
  sendServerConversions,
} from "~/services/serverConversions.server";

// The thank-you page (web pixel → /api/track) usually reports the order within
// seconds and has the browser context Meta matches on (fbp/fbc, IP, user agent),
// so it gets first claim on the Purchase conversion. The webhook only sends if
// nobody has after this delay — e.g. the buyer closed the tab before the
// thank-you page loaded.
const PURCHASE_FALLBACK_DELAY_MS = 30_000;
import { scheduleReviewRequest } from "~/services/reviewEmail.server";
import { enrollInFlows } from "~/services/automationEngine.server";
import { buildJourneyCredits } from "~/services/touchpoints.server";
import { getShopPlan, checkOrdersQuota } from "~/services/plan.server";

function pickFirstString(x: unknown): string | null {
  return typeof x === "string" && x.trim().length ? x.trim() : null;
}

function pickFirstNumber(x: unknown): number | null {
  if (typeof x === "number" && Number.isFinite(x)) return x;
  if (typeof x === "string") {
    const n = Number(x);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function getUtmFromUrl(url: string) {
  try {
    const u = new URL(url);
    return {
      utmSource: u.searchParams.get("utm_source"),
      utmMedium: u.searchParams.get("utm_medium"),
      utmCampaign: u.searchParams.get("utm_campaign"),
      fbclid: u.searchParams.get("fbclid"),
      gclid: u.searchParams.get("gclid"),
      ttclid: u.searchParams.get("ttclid"),
      msclkid: u.searchParams.get("msclkid"),
    };
  } catch {
    return {
      utmSource: null,
      utmMedium: null,
      utmCampaign: null,
      fbclid: null,
      gclid: null,
      ttclid: null,
      msclkid: null,
    };
  }
}

function findNoteAttribute(payload: any, name: string): string | null {
  const attrs = Array.isArray(payload?.note_attributes) ? payload.note_attributes : [];
  const found = attrs.find(
    (item: any) => String(item?.name || "").toLowerCase() === name.toLowerCase(),
  );
  return pickFirstString(found?.value);
}

export async function action({ request }: ActionFunctionArgs) {
  // authenticate.webhook MUST be called outside any try/catch so HMAC
  // verification failures propagate as 400 rather than being swallowed as 500.
  const { topic, shop, payload } = await shopify.authenticate.webhook(request);

  try {
    // Prefer the numeric ID — it matches what the pixel tracker stores.
    // The GID (admin_graphql_api_id) causes duplicate rows when both the
    // pixel and the webhook fire for the same order.
    const orderId =
      pickFirstString(payload?.id?.toString?.()) ||
      pickFirstString(payload?.admin_graphql_api_id) ||
      pickFirstString(payload?.order_number?.toString?.()) ||
      null;

    const totalValue =
      pickFirstNumber(payload?.current_total_price) ??
      pickFirstNumber(payload?.total_price) ??
      0;

    const currency =
      pickFirstString(payload?.currency) ||
      pickFirstString(payload?.presentment_currency) ||
      "USD";

    const landingUrl =
      pickFirstString(payload?.landing_site) ||
      pickFirstString(payload?.landing_site_ref) ||
      null;

    const referringSite = pickFirstString(payload?.referring_site) || null;
    // "web", "shopify_draft_order", "pos", … — lets reports tell offline orders
    // apart from online ones whose visit we didn't see.
    const salesChannel = pickFirstString(payload?.source_name) || null;

    const email =
      pickFirstString(payload?.email) ||
      pickFirstString(payload?.customer?.email) ||
      null;

    const phone =
      pickFirstString(payload?.phone) ||
      pickFirstString(payload?.customer?.phone) ||
      null;

    const ip =
      pickFirstString(payload?.browser_ip) ||
      pickFirstString(payload?.client_details?.browser_ip) ||
      null;

    const country =
      pickFirstString(payload?.billing_address?.country_code) ||
      pickFirstString(payload?.shipping_address?.country_code) ||
      null;

    const city =
      pickFirstString(payload?.billing_address?.city) ||
      pickFirstString(payload?.shipping_address?.city) ||
      null;

    const firstName =
      pickFirstString(payload?.customer?.first_name) ||
      pickFirstString(payload?.billing_address?.first_name) ||
      pickFirstString(payload?.shipping_address?.first_name) ||
      null;
    const lastName =
      pickFirstString(payload?.customer?.last_name) ||
      pickFirstString(payload?.billing_address?.last_name) ||
      pickFirstString(payload?.shipping_address?.last_name) ||
      null;

    const zip =
      pickFirstString(payload?.billing_address?.zip) ||
      pickFirstString(payload?.shipping_address?.zip) ||
      null;

    const state =
      pickFirstString(payload?.billing_address?.province_code) ||
      pickFirstString(payload?.shipping_address?.province_code) ||
      null;

    const customerName = firstName || lastName
      ? `${firstName || ""} ${lastName || ""}`.trim()
      : null;

    const userAgent =
      pickFirstString(payload?.client_details?.user_agent) ||
      null;

    const utm = getUtmFromUrl(landingUrl || "");

    const visitorId =
      findNoteAttribute(payload, "attribix_visitor_id") ||
      findNoteAttribute(payload, "visitorId") ||
      null;

    const sessionId =
      findNoteAttribute(payload, "attribix_session_id") ||
      findNoteAttribute(payload, "sessionId") ||
      null;

    if (orderId) {
      // Enforce monthly order quota — check only for new orders (not re-deliveries)
      const existingOrder = await db.purchase.findUnique({ where: { orderId } });
      if (!existingOrder) {
        const plan = await getShopPlan(shop);
        const quota = await checkOrdersQuota(shop, plan);
        if (!quota.allowed) {
          console.log(`[orders_create] quota exceeded for ${shop} (${quota.used}/${quota.limit}) — order ${orderId} not saved`);
          return json({ ok: false, reason: "quota_exceeded" }, { status: 200 });
        }
      }

      await db.purchase.upsert({
        where: { orderId },
        create: {
          createdAt: new Date(payload?.created_at || Date.now()),
          totalValue,
          currency,
          shop,
          orderId,
          visitorId,
          sessionId,
          utmSource: utm.utmSource,
          utmMedium: utm.utmMedium,
          utmCampaign: utm.utmCampaign,
          fbclid: utm.fbclid,
          gclid: utm.gclid,
          ttclid: utm.ttclid,
          msclkid: utm.msclkid,
          salesChannel,
          country,
          city,
          customerName,
        },
        update: {
          totalValue,
          currency,
          shop,
          visitorId: visitorId ?? undefined,
          sessionId: sessionId ?? undefined,
          utmSource: utm.utmSource ?? undefined,
          utmMedium: utm.utmMedium ?? undefined,
          utmCampaign: utm.utmCampaign ?? undefined,
          fbclid: utm.fbclid ?? undefined,
          gclid: utm.gclid ?? undefined,
          ttclid: utm.ttclid ?? undefined,
          msclkid: utm.msclkid ?? undefined,
          salesChannel: salesChannel ?? undefined,
          country: country ?? undefined,
          city: city ?? undefined,
          customerName: customerName ?? undefined,
        },
      });

      // Schedule review request email (fire-and-forget)
      scheduleReviewRequest({ shop, orderId, payload }).catch((e: any) =>
        console.error("[webhooks.orders_create] review schedule error:", e?.message)
      );

      // Build multi-touch journey credits (fire-and-forget)
      buildJourneyCredits({
        shop,
        orderId: orderId!,
        visitorId: visitorId ?? null,
        revenue: totalValue,
        currency,
        purchaseTime: new Date(payload?.created_at || Date.now()),
        fallback: {
          utmSource:   utm.utmSource,
          utmMedium:   utm.utmMedium,
          utmCampaign: utm.utmCampaign,
          fbclid:      utm.fbclid,
          gclid:       utm.gclid,
          ttclid:      utm.ttclid,
          msclkid:     utm.msclkid,
          referrer:    referringSite,
        },
      }).catch((e: any) =>
        console.error("[webhooks.orders_create] buildJourneyCredits error:", e?.message)
      );

      // Enroll in order_created automation flows
      const customerEmail = payload?.email || payload?.customer?.email;
      if (customerEmail) {
        const firstName = payload?.customer?.first_name || payload?.billing_address?.first_name || undefined;
        enrollInFlows({ shop, trigger: "order_created", email: customerEmail, firstName, triggeredBy: orderId ?? undefined }).catch(() => null);
      }

      // Variant ids, matching what Shopify's own Meta channel sends for catalog matching.
      const contentIds = (Array.isArray(payload?.line_items) ? payload.line_items : [])
        .map((li: any) => pickFirstString(li?.variant_id?.toString?.()))
        .filter(Boolean) as string[];
      const numItems = (Array.isArray(payload?.line_items) ? payload.line_items : [])
        .reduce((sum: number, li: any) => sum + (pickFirstNumber(li?.quantity) ?? 0), 0);

      // Fire-and-forget after responding: Shopify retries webhooks that take
      // longer than 5s, and every retry used to send another Purchase.
      const purchaseOrderId = orderId;
      setTimeout(() => {
        sendFallbackPurchase().catch((e: any) =>
          console.error("[webhooks.orders_create] fallback purchase error:", e?.message || e),
        );
      }, PURCHASE_FALLBACK_DELAY_MS);

      async function sendFallbackPurchase() {
        if (!(await claimPurchaseConversion(purchaseOrderId))) return;

        // Browser ids: whatever the pixel stored on this order's Purchase row,
        // else the latest page event from the same click or visitor.
        const row = await db.purchase.findUnique({
          where: { orderId: purchaseOrderId },
          select: { fbp: true, fbc: true, visitorId: true },
        });
        let realFbc: string | null = row?.fbc ?? null;
        let realFbp: string | null = row?.fbp ?? null;
        const rowVisitorId = row?.visitorId ?? visitorId;
        if (!realFbc || !realFbp) {
          try {
            const fbcMatchClauses: any[] = [];
            if (utm.fbclid) fbcMatchClauses.push({ fbclid: utm.fbclid });
            if (rowVisitorId) fbcMatchClauses.push({ visitorId: rowVisitorId });
            if (fbcMatchClauses.length > 0) {
              const recentCutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
              const ctx = await db.trackedEvent.findFirst({
                where: {
                  shop,
                  createdAt: { gte: recentCutoff },
                  OR: fbcMatchClauses,
                },
                orderBy: { createdAt: "desc" },
                select: { fbc: true, fbp: true },
              });
              realFbc ??= ctx?.fbc ?? null;
              realFbp ??= ctx?.fbp ?? null;
            }
          } catch {}
        }

        // Look up per-shop pixel credentials so each merchant's conversions go
        // to their own Meta pixel, not the global env-var fallback.
        const shopTrackingSettings = await (db as any).trackingSettings?.findUnique?.({
          where: { shop },
          select: { fbPixelId: true, fbToken: true },
        }).catch(() => null);

        try {
          const conversionResult = await sendServerConversions({
            eventName: "Purchase",
            eventTime: Math.floor(
              new Date(payload?.created_at || Date.now()).getTime() / 1000,
            ),
            eventId: `shopify_order_${purchaseOrderId}`,
            orderId: purchaseOrderId,
            value: totalValue,
            currency,
            contentIds: contentIds.length ? contentIds : null,
            numItems: numItems || null,
            url: landingUrl,
            // Where the purchase happened (order status page), not the ad landing page.
            sourceUrl: pickFirstString(payload?.order_status_url) || landingUrl || referringSite,
            actionSource: "website",
            shop,
            ip,
            userAgent,
            email,
            phone,
            firstName,
            lastName,
            city,
            zip,
            state,
            country,
            fbclid: utm.fbclid,
            fbc: realFbc,
            fbp: realFbp,
            gclid: utm.gclid,
            ttclid: utm.ttclid,
            externalId: rowVisitorId || email || null,
            shopPixelId: shopTrackingSettings?.fbPixelId,
            shopToken: shopTrackingSettings?.fbToken,
          });

          console.log("[webhooks.orders_create] fallback purchase sent", { orderId: purchaseOrderId, hasFbp: Boolean(realFbp), hasFbc: Boolean(realFbc), meta: conversionResult.meta });
        } catch (conversionError: any) {
          await releasePurchaseConversion(purchaseOrderId);
          console.error(
            "[webhooks.orders_create] server conversion error:",
            conversionError?.message || conversionError,
          );
        }
      }
    }

    return json({
      ok: true,
      topic,
      shop,
      saved: Boolean(orderId),
      orderId,
    });
  } catch (err: any) {
    return json({ ok: false, error: String(err?.message ?? err) }, { status: 500 });
  }
}