// app/routes/webhooks.orders_create.ts
import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { db } from "~/db.server";
import shopify from "~/shopify.server";
import { sendServerConversions } from "~/services/serverConversions.server";

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

    const orderId =
      pickFirstString(payload?.admin_graphql_api_id) ||
      pickFirstString(payload?.id?.toString?.()) ||
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
        },
      });

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