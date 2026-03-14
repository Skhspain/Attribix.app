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

    const rawUrl =
      pickFirstString(event?.context?.document?.location?.href) ??
      pickFirstString(data?.url) ??
      null;

    const rawReferrer = pickFirstString(data?.referrer) ?? null;

    const requestedShop =
      pickFirstString(data?.shop) ||
      null;

    const inferredStorefrontHost = getShopFromOriginOrUrl(origin, rawUrl);
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
      url: rawUrl,
      referrer: rawReferrer,
      shop: resolvedShop,
      ip,
      userAgent: ua,
    });

    const eventName = normalizedEvent.eventName;
    const url = normalizedEvent.url;
    const referrer = normalizedEvent.referrer;
    const host = pickFirstString(data?.host) ?? getHostFromUrl(url);
    const originHost = origin;

    const visitorId = normalizedEvent.visitorId;
    const sessionId = normalizedEvent.sessionId;
    const eventId = normalizedEvent.eventId;
    const accountId = pickFirstString(data?.accountID) || pickFirstString(data?.accountId);

    const fbclid = normalizedEvent.fbclid;
    const gclid = normalizedEvent.gclid;
    const ttclid = normalizedEvent.ttclid;
    const msclkid = normalizedEvent.msclkid;
    const fbp = normalizedEvent.fbp;
    const fbc = normalizedEvent.fbc;

    console.log("[/api/track] HIT", {
      origin,
      ip,
      ua: ua ? ua.slice(0, 120) : null,
      keys: Object.keys(data || {}).slice(0, 60),
      type: data?.type ?? null,
      accountID: data?.accountID ?? null,
      eventType: data?.event?.type ?? null,
      eventName: data?.event?.name ?? null,
      requestedShop,
      resolvedShop,
      inferredStorefrontHost,
      visitorId,
      sessionId,
      eventId,
      referrer,
      clickIds: data?.clickIds ?? null,
      fbp,
      fbc,
      urlFromBody: data?.url ?? null,
      orderId: normalizedEvent.orderId,
      value: normalizedEvent.value,
      currency: normalizedEvent.currency,
      email: normalizedEvent.email,
      phone: normalizedEvent.phone,
      authMode: matchedSettings
        ? matchedSettings.trackingKey
          ? "tracking_key"
          : "shop_only"
        : "legacy_open",
      normalizedEvent,
    });

    try {
      await db.trackedEvent.create({
        data: {
          eventName,
          createdAt: new Date(),
          url,
          source: normalizedEvent.utmSource ?? null,
          sessionId: sessionId ?? null,
          utmSource: normalizedEvent.utmSource ?? null,
          utmMedium: normalizedEvent.utmMedium ?? null,
          utmCampaign: normalizedEvent.utmCampaign ?? null,
          ip,
          userAgent: ua,
          shop: resolvedShop,
          visitorId,
          eventId,
          referrer,
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

    const possibleOrderId = normalizedEvent.orderId;
    const possibleTotal = normalizedEvent.value;
    const possibleCurrency = normalizedEvent.currency;
    const possibleEmail = normalizedEvent.email;
    const possiblePhone = normalizedEvent.phone;

    const isPurchaseLike =
      ["purchase", "checkout_completed", "order_completed", "payment_completed"].includes(
        (eventName || "").toLowerCase(),
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
          utmSource: normalizedEvent.utmSource ?? null,
          utmMedium: normalizedEvent.utmMedium ?? null,
          utmCampaign: normalizedEvent.utmCampaign ?? null,
          fbclid,
          gclid,
          ttclid,
          msclkid,
          fbp,
          fbc,
          referrer,
          landingPage: url,
        },
        update: {
          totalValue: possibleTotal ?? undefined,
          currency: possibleCurrency ?? undefined,
          shop: resolvedShop ?? undefined,
          visitorId: visitorId ?? undefined,
          sessionId: sessionId ?? undefined,
          utmSource: normalizedEvent.utmSource ?? undefined,
          utmMedium: normalizedEvent.utmMedium ?? undefined,
          utmCampaign: normalizedEvent.utmCampaign ?? undefined,
          fbclid: fbclid ?? undefined,
          gclid: gclid ?? undefined,
          ttclid: ttclid ?? undefined,
          msclkid: msclkid ?? undefined,
          fbp: fbp ?? undefined,
          fbc: fbc ?? undefined,
          referrer: referrer ?? undefined,
          landingPage: url ?? undefined,
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
          url,
          sourceUrl: url,
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

    return corsify(json({ ok: true, saved: true, eventName }, { status: 200 }));
  } catch (err: any) {
    console.error("[/api/track] error:", err?.message || err);
    return corsify(json({ ok: false, error: "server error" }, { status: 500 }));
  }
}