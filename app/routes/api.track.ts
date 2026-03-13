// app/routes/api.track.ts
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { db } from "~/db.server";
import { sendServerConversions } from "~/services/serverConversions.server";
import { normalizeTrackedEvent } from "~/services/trackingNormalizer.server";
import { touchTrackingHealth } from "~/models/trackingSettings.server";

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
  "Access-Control-Allow-Headers": "content-type,authorization,accept",
  "Access-Control-Max-Age": "86400",
};

function corsify(res: Response) {
  Object.entries(CORS).forEach(([k, v]) => res.headers.set(k, v));
  return res;
}

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
    };
  } catch {
    return { utmSource: null, utmMedium: null, utmCampaign: null };
  }
}

function getHostFromUrl(url: string | null): string | null {
  try {
    if (!url) return null;
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

function getShopFromOriginOrUrl(origin: string | null, url: string | null): string | null {
  try {
    if (origin) return new URL(origin).hostname;
  } catch {}
  try {
    if (url) return new URL(url).hostname;
  } catch {}
  return null;
}

function normalizeOrderId(value: unknown): string | null {
  const s = pickFirstString(value);
  if (!s) return null;
  return s;
}

function isUniqueConstraintError(err: any) {
  return err?.code === "P2002" || String(err?.message || "").includes("Unique constraint");
}

function getTrackingKeyFromRequest(request: Request, data: any) {
  const fromBody = pickFirstString(data?.trackingKey);
  if (fromBody) return fromBody;

  const auth = request.headers.get("authorization");
  if (!auth) return null;

  const match = auth.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

async function readJsonBody(request: Request) {
  const ct = request.headers.get("content-type") || "";
  if (ct.includes("application/json")) {
    return await request.json();
  }

  const text = await request.text();
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export async function loader({ request }: LoaderFunctionArgs) {
  if (request.method === "OPTIONS") return corsify(new Response(null, { status: 204 }));
  return corsify(new Response("Method not allowed", { status: 405 }));
}

export async function action({ request }: ActionFunctionArgs) {
  const method = request.method.toUpperCase();

  if (method === "OPTIONS") return corsify(new Response(null, { status: 204 }));
  if (method !== "POST") return corsify(new Response("Method not allowed", { status: 405 }));

  const origin = request.headers.get("origin") || null;
  const ua = request.headers.get("user-agent") || null;

  const ip =
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("fly-client-ip") ||
    (request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "") ||
    null;

  try {
    const data: any = await readJsonBody(request);

    if (!data) {
      console.error("[/api/track] invalid json body");
      return corsify(json({ ok: false, error: "invalid json" }, { status: 400 }));
    }

    const type = pickFirstString(data?.type);
    if (!type) return corsify(new Response(null, { status: 204 }));

    const event = data?.event ?? null;
    const eventSnapshot = data?.eventSnapshot ?? null;

    const eventName =
      pickFirstString(type) ??
      pickFirstString(eventSnapshot?.name) ??
      pickFirstString(event?.name) ??
      pickFirstString(event?.type) ??
      "unknown";

    const url =
      pickFirstString(data?.url) ??
      pickFirstString(eventSnapshot?.url) ??
      pickFirstString(event?.context?.document?.location?.href) ??
      pickFirstString(event?.data?.context?.document?.location?.href) ??
      null;

    const referrer =
      pickFirstString(data?.referrer) ??
      pickFirstString(eventSnapshot?.referrer) ??
      null;

    const host = pickFirstString(data?.host) ?? getHostFromUrl(url);
    const originHost = origin;

    const requestedShop =
      pickFirstString(data?.shop) ||
      null;

    const inferredStorefrontHost = getShopFromOriginOrUrl(origin, url);
    const trackingKey = getTrackingKeyFromRequest(request, data);

    let matchedSettings: any = null;

    if (requestedShop) {
      matchedSettings = await db.trackingSettings.findUnique({
        where: { shop: requestedShop },
      });
    }

    if (!matchedSettings && trackingKey) {
      matchedSettings = await db.trackingSettings.findUnique({
        where: { trackingKey },
      });
    }

    if (requestedShop && matchedSettings && matchedSettings.shop !== requestedShop) {
      console.error("[/api/track] tracking key/shop mismatch", {
        requestedShop,
        matchedShop: matchedSettings.shop,
      });
      return corsify(json({ ok: false, error: "shop mismatch" }, { status: 403 }));
    }

    if (matchedSettings?.trackingEnabled === false) {
      return corsify(json({ ok: false, error: "tracking disabled" }, { status: 403 }));
    }

    if (matchedSettings?.trackingKey && trackingKey !== matchedSettings.trackingKey) {
      console.error("[/api/track] invalid tracking key", {
        requestedShop,
        matchedShop: matchedSettings.shop,
        hasTrackingKey: Boolean(trackingKey),
      });
      return corsify(json({ ok: false, error: "invalid tracking key" }, { status: 403 }));
    }

    const resolvedShop =
      matchedSettings?.shop ||
      requestedShop ||
      inferredStorefrontHost ||
      null;

    const normalizedEvent = normalizeTrackedEvent({
      data,
      event,
      type,
      url,
      referrer,
      shop: resolvedShop,
      ip,
      userAgent: ua,
    });

    console.log("[/api/track] HIT", {
      origin,
      ip,
      ua: ua ? ua.slice(0, 120) : null,
      keys: Object.keys(data || {}).slice(0, 40),
      type: data?.type ?? null,
      accountID: data?.accountID ?? null,
      eventType: data?.event?.type ?? data?.eventSnapshot?.type ?? null,
      eventName: data?.event?.name ?? data?.eventSnapshot?.name ?? null,
      requestedShop,
      resolvedShop,
      inferredStorefrontHost,
      visitorId: data?.visitorId ?? null,
      sessionId: data?.sessionId ?? null,
      eventId: data?.eventId ?? null,
      referrer: data?.referrer ?? null,
      clickIds: data?.clickIds ?? null,
      fbp: data?.fbp ?? null,
      fbc: data?.fbc ?? null,
      urlFromBody: data?.url ?? null,
      orderId: data?.orderId ?? data?.eventSnapshot?.orderId ?? null,
      value: data?.value ?? data?.totalValue ?? data?.eventSnapshot?.totalValue ?? null,
      currency: data?.currency ?? data?.eventSnapshot?.currency ?? null,
      email: data?.email ?? data?.eventSnapshot?.email ?? null,
      phone: data?.phone ?? data?.eventSnapshot?.phone ?? null,
      authMode: matchedSettings
        ? matchedSettings.trackingKey
          ? "tracking_key"
          : "shop_only"
        : "legacy_open",
      normalizedEvent,
    });

    const normalizedUrl = normalizedEvent.url || url || null;
    const { utmSource, utmMedium, utmCampaign } = getUtmFromUrl(normalizedUrl || "");

    const visitorId = normalizedEvent.visitorId;
    const sessionId = normalizedEvent.sessionId;
    const eventId = normalizedEvent.eventId || pickFirstString(data?.eventId);
    const accountId = pickFirstString(data?.accountID) || pickFirstString(data?.accountId);

    const clickIds = data?.clickIds ?? {};
    const fbclid =
      normalizedEvent.fbclid ??
      pickFirstString(clickIds?.fbclid) ??
      pickFirstString(data?.fbclid) ??
      null;

    const gclid =
      normalizedEvent.gclid ??
      pickFirstString(clickIds?.gclid) ??
      pickFirstString(data?.gclid) ??
      null;

    const ttclid =
      normalizedEvent.ttclid ??
      pickFirstString(clickIds?.ttclid) ??
      pickFirstString(data?.ttclid) ??
      null;

    const msclkid =
      normalizedEvent.msclkid ??
      pickFirstString(clickIds?.msclkid) ??
      pickFirstString(data?.msclkid) ??
      null;

    const fbp = normalizedEvent.fbp ?? pickFirstString(data?.fbp);
    const fbc = normalizedEvent.fbc ?? pickFirstString(data?.fbc);

    try {
      await db.trackedEvent.create({
        data: {
          eventName: normalizedEvent.eventName || eventName,
          createdAt: new Date(),
          url: normalizedUrl,
          source: utmSource ?? null,
          sessionId: sessionId ?? null,
          utmSource: utmSource ?? null,
          utmMedium: utmMedium ?? null,
          utmCampaign: utmCampaign ?? null,
          ip,
          userAgent: ua,
          shop: resolvedShop,
          visitorId,
          eventId,
          referrer: normalizedEvent.referrer ?? referrer,
          fbclid,
          gclid,
          ttclid,
          msclkid,
          fbp,
          fbc,
          host,
          origin: originHost,
          accountId,
        },
      });
    } catch (trackedEventError: any) {
      if (eventId && isUniqueConstraintError(trackedEventError)) {
        console.log("[/api/track] duplicate eventId ignored", { eventId });
      } else {
        throw trackedEventError;
      }
    }

    if (matchedSettings?.shop) {
      try {
        await touchTrackingHealth(matchedSettings.shop, {
          pixelSeen: type === "pixel_boot",
        });
      } catch (healthError: any) {
        console.error("[/api/track] touchTrackingHealth error:", healthError?.message || healthError);
      }
    }

    const possibleOrderId =
      normalizedEvent.orderId ||
      normalizeOrderId(eventSnapshot?.orderId) ||
      normalizeOrderId(data?.orderId) ||
      normalizeOrderId(event?.orderId) ||
      normalizeOrderId(event?.data?.orderId) ||
      normalizeOrderId(event?.data?.order?.id) ||
      normalizeOrderId(event?.data?.checkout?.order?.id) ||
      null;

    const possibleTotal =
      normalizedEvent.value ??
      pickFirstNumber(eventSnapshot?.totalValue) ??
      pickFirstNumber(eventSnapshot?.value) ??
      pickFirstNumber(data?.totalValue) ??
      pickFirstNumber(data?.value) ??
      pickFirstNumber(event?.value) ??
      pickFirstNumber(event?.data?.totalPrice?.amount) ??
      pickFirstNumber(event?.data?.checkout?.totalPrice?.amount) ??
      pickFirstNumber(event?.data?.totalPrice) ??
      pickFirstNumber(event?.data?.checkout?.totalPrice) ??
      null;

    const possibleCurrency =
      normalizedEvent.currency ||
      pickFirstString(eventSnapshot?.currency) ||
      pickFirstString(data?.currency) ||
      pickFirstString(event?.currency) ||
      pickFirstString(event?.data?.currency) ||
      pickFirstString(event?.data?.checkout?.currencyCode) ||
      pickFirstString(event?.data?.checkout?.totalPrice?.currencyCode) ||
      null;

    const possibleEmail =
      normalizedEvent.email ||
      pickFirstString(eventSnapshot?.email) ||
      pickFirstString(data?.email) ||
      pickFirstString(event?.email) ||
      pickFirstString(event?.data?.email) ||
      pickFirstString(event?.data?.checkout?.email) ||
      null;

    const possiblePhone =
      normalizedEvent.phone ||
      pickFirstString(eventSnapshot?.phone) ||
      pickFirstString(data?.phone) ||
      pickFirstString(event?.phone) ||
      pickFirstString(event?.data?.phone) ||
      pickFirstString(event?.data?.checkout?.phone) ||
      null;

    const isPurchaseLike =
      ["purchase", "checkout_completed", "order_completed", "payment_completed"].includes(
        (normalizedEvent.eventName || eventName || "").toLowerCase(),
      ) ||
      ["purchase", "checkout_completed", "order_completed", "payment_completed"].includes(
        (type || "").toLowerCase(),
      );

    if (possibleOrderId && isPurchaseLike) {
      await db.purchase.upsert({
        where: { orderId: possibleOrderId },
        create: {
          createdAt: new Date(),
          totalValue: possibleTotal ?? 0,
          currency: possibleCurrency ?? "USD",
          shop: resolvedShop,
          orderId: possibleOrderId,
          visitorId,
          sessionId: sessionId ?? null,
          utmSource: utmSource ?? null,
          utmMedium: utmMedium ?? null,
          utmCampaign: utmCampaign ?? null,
          fbclid,
          gclid,
          ttclid,
          msclkid,
          fbp,
          fbc,
          referrer: normalizedEvent.referrer ?? referrer,
          landingPage: normalizedUrl,
        },
        update: {
          totalValue: possibleTotal ?? undefined,
          currency: possibleCurrency ?? undefined,
          shop: resolvedShop ?? undefined,
          visitorId: visitorId ?? undefined,
          sessionId: sessionId ?? undefined,
          utmSource: utmSource ?? undefined,
          utmMedium: utmMedium ?? undefined,
          utmCampaign: utmCampaign ?? undefined,
          fbclid: fbclid ?? undefined,
          gclid: gclid ?? undefined,
          ttclid: ttclid ?? undefined,
          msclkid: msclkid ?? undefined,
          fbp: fbp ?? undefined,
          fbc: fbc ?? undefined,
          referrer: (normalizedEvent.referrer ?? referrer) ?? undefined,
          landingPage: normalizedUrl ?? undefined,
        },
      });

      try {
        const conversionResult = await sendServerConversions({
          eventName: "Purchase",
          eventTime: Math.floor(Date.now() / 1000),
          eventId: eventId || `purchase_${possibleOrderId}`,
          orderId: possibleOrderId,
          value: possibleTotal ?? 0,
          currency: possibleCurrency ?? "USD",
          url: normalizedUrl,
          sourceUrl: normalizedUrl,
          actionSource: "website",
          shop: resolvedShop,
          ip,
          userAgent: ua,
          email: possibleEmail,
          phone: possiblePhone,
          fbclid,
          fbp,
          fbc,
          gclid,
          externalId: visitorId,
        });

        console.log("[/api/track] server conversions", conversionResult);
      } catch (conversionError: any) {
        console.error(
          "[/api/track] server conversion error:",
          conversionError?.message || conversionError,
        );
      }
    }

    return corsify(
      json(
        {
          ok: true,
          saved: true,
          eventName: normalizedEvent.eventName || eventName,
          normalizedEvent,
        },
        { status: 200 },
      ),
    );
  } catch (err: any) {
    console.error("[/api/track] error:", err?.message || err);
    return corsify(json({ ok: false, error: "server error" }, { status: 500 }));
  }
}