// app/routes/webhooks.orders_create.ts
import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { db } from "~/db.server";
import shopify from "~/shopify.server";
import { sendServerConversions } from "~/services/serverConversions.server";
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
  try {
    const { topic, shop, payload } = await shopify.authenticate.webhook(request);

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

      try {
        const conversionResult = await sendServerConversions({
          eventName: "Purchase",
          eventTime: Math.floor(
            new Date(payload?.created_at || Date.now()).getTime() / 1000,
          ),
          eventId: `shopify_order_${orderId}`,
          orderId,
          value: totalValue,
          currency,
          url: landingUrl,
          sourceUrl: landingUrl || referringSite,
          actionSource: "website",
          shop,
          ip,
          userAgent,
          email,
          phone,
          fbclid: utm.fbclid,
          externalId: visitorId || email || null,
        });

        console.log("[webhooks.orders_create] server conversions", conversionResult);
      } catch (conversionError: any) {
        console.error(
          "[webhooks.orders_create] server conversion error:",
          conversionError?.message || conversionError,
        );
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