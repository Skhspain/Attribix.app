import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { db } from "~/db.server";
import { sendServerConversions } from "~/services/serverConversions.server";
import { normalizeTrackedEvent } from "~/services/trackingNormalizer.server";
import { touchTrackingHealth } from "~/models/trackingSettings.server";

function corsify(request: Request, res: Response) {
  const origin = request.headers.get("origin");

  if (origin) {
    res.headers.set("Access-Control-Allow-Origin", origin);
    res.headers.set("Vary", "Origin");
  } else {
    res.headers.set("Access-Control-Allow-Origin", "*");
  }

  res.headers.set("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.headers.set("Access-Control-Allow-Headers", "content-type,authorization,accept");
  res.headers.set("Access-Control-Allow-Credentials", "true");
  res.headers.set("Access-Control-Max-Age", "86400");

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

function normalizeComparableUrl(url: string | null): string | null {
  try {
    if (!url) return null;
    const u = new URL(url);
    return `${u.origin}${u.pathname}`;
  } catch {
    return null;
  }
}

function getUrlPath(url: string | null): string | null {
  try {
    if (!url) return null;
    return new URL(url).pathname || null;
  } catch {
    return null;
  }
}

function isCheckoutLikeUrl(url: string | null): boolean {
  const path = getUrlPath(url);
  if (!path) return false;
  return path.includes("/checkouts/");
}

function hasAttributionSignals(row: {
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  fbclid?: string | null;
  gclid?: string | null;
  ttclid?: string | null;
  msclkid?: string | null;
  fbp?: string | null;
  fbc?: string | null;
}) {
  return Boolean(
    row.utmSource ||
      row.utmMedium ||
      row.utmCampaign ||
      row.fbclid ||
      row.gclid ||
      row.ttclid ||
      row.msclkid ||
      row.fbp ||
      row.fbc,
  );
}

async function findLatestBrowserContext(input: {
  shop: string | null;
  visitorId: string | null;
  sessionId: string | null;
  fbp?: string | null;
  fbc?: string | null;
  fbclid?: string | null;
  gclid?: string | null;
  ttclid?: string | null;
  msclkid?: string | null;
  currentUrl?: string | null;
  referrer?: string | null;
}) {
  const {
    shop,
    visitorId,
    sessionId,
    fbp,
    fbc,
    fbclid,
    gclid,
    ttclid,
    msclkid,
    currentUrl,
    referrer,
  } = input;

  if (!shop) return null;

  const comparableCurrentUrl = normalizeComparableUrl(currentUrl ?? null);
  const comparableReferrer = normalizeComparableUrl(referrer ?? null);
  const currentPath = getUrlPath(currentUrl ?? null);
  const referrerPath = getUrlPath(referrer ?? null);

  const orClauses = [
    visitorId ? { visitorId } : undefined,
    sessionId ? { sessionId } : undefined,
    fbp ? { fbp } : undefined,
    fbc ? { fbc } : undefined,
    fbclid ? { fbclid } : undefined,
    gclid ? { gclid } : undefined,
    ttclid ? { ttclid } : undefined,
    msclkid ? { msclkid } : undefined,
  ].filter(Boolean) as any[];

  const recentCutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const rows = await db.trackedEvent.findMany({
    where: {
      shop,
      createdAt: {
        gte: recentCutoff,
      },
      ...(orClauses.length ? { OR: orClauses } : {}),
    },
    orderBy: {
      createdAt: "desc",
    },
    take: orClauses.length ? 80 : 200,
    select: {
      createdAt: true,
      eventName: true,
      visitorId: true,
      sessionId: true,
      fbclid: true,
      gclid: true,
      ttclid: true,
      msclkid: true,
      fbp: true,
      fbc: true,
      url: true,
      referrer: true,
      utmSource: true,
      utmMedium: true,
      utmCampaign: true,
    },
  });

  const usableRows = rows.filter((row) => {
    return Boolean(
      row.fbp ||
        row.fbc ||
        row.fbclid ||
        row.gclid ||
        row.ttclid ||
        row.msclkid ||
        row.utmSource ||
        row.utmMedium ||
        row.utmCampaign ||
        row.url ||
        row.referrer,
    );
  });

  if (!usableRows.length) return null;

  const scored = usableRows
    .map((row) => {
      let score = 0;

      const rowComparableUrl = normalizeComparableUrl(row.url ?? null);
      const rowComparableReferrer = normalizeComparableUrl(row.referrer ?? null);
      const rowPath = getUrlPath(row.url ?? null);
      const rowReferrerPath = getUrlPath(row.referrer ?? null);
      const rowHasAttribution = hasAttributionSignals(row);
      const rowUrlIsCheckoutLike = isCheckoutLikeUrl(row.url ?? null);
      const rowReferrerIsCheckoutLike = isCheckoutLikeUrl(row.referrer ?? null);

      if (row.eventName === "browser_context_sync") score += 200;
      if (row.eventName === "product_viewed") score += 120;
      if (row.eventName === "page_viewed") score += 40;
      if (row.eventName === "checkout_started") score -= 20;
      if (row.eventName === "checkout_completed") score -= 40;

      if (visitorId && row.visitorId === visitorId) score += 20;
      if (sessionId && row.sessionId === sessionId) score += 20;
      if (fbp && row.fbp === fbp) score += 40;
      if (fbc && row.fbc === fbc) score += 50;
      if (fbclid && row.fbclid === fbclid) score += 40;
      if (gclid && row.gclid === gclid) score += 40;
      if (ttclid && row.ttclid === ttclid) score += 40;
      if (msclkid && row.msclkid === msclkid) score += 40;

      if (rowHasAttribution) score += 80;
      if (row.fbclid) score += 60;
      if (row.fbc) score += 70;
      if (row.fbp) score += 40;
      if (row.utmSource) score += 25;
      if (row.utmCampaign) score += 25;
      if (row.utmMedium) score += 10;

      if (comparableCurrentUrl && rowComparableUrl === comparableCurrentUrl) score += 35;
      if (comparableCurrentUrl && rowComparableReferrer === comparableCurrentUrl) score += 20;

      if (comparableReferrer && rowComparableUrl === comparableReferrer) score += 140;
      if (comparableReferrer && rowComparableReferrer === comparableReferrer) score += 40;

      if (currentPath && rowPath === currentPath) score += 10;
      if (currentPath && rowReferrerPath === currentPath) score += 5;

      if (referrerPath && rowPath === referrerPath) score += 25;
      if (referrerPath && rowReferrerPath === referrerPath) score += 10;

      if (rowUrlIsCheckoutLike) score -= 120;
      if (rowReferrerIsCheckoutLike) score -= 40;

      if (row.url) score += 2;
      if (row.referrer) score += 2;

      return { row, score };
    })
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return Number(new Date(b.row.createdAt)) - Number(new Date(a.row.createdAt));
    });

  return scored[0]?.row || null;
}

export async function loader({ request }: LoaderFunctionArgs) {
  if (request.method === "OPTIONS") {
    return corsify(request, new Response(null, { status: 204 }));
  }

  return corsify(request, new Response("Method not allowed", { status: 405 }));
}

export async function action({ request }: ActionFunctionArgs) {
  const method = request.method.toUpperCase();

  if (method === "OPTIONS") {
    return corsify(request, new Response(null, { status: 204 }));
  }

  if (method !== "POST") {
    return corsify(request, new Response("Method not allowed", { status: 405 }));
  }

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
      return corsify(request, json({ ok: false, error: "invalid json" }, { status: 400 }));
    }

    const type = pickFirstString(data?.type);
    if (!type) {
      return corsify(request, new Response(null, { status: 204 }));
    }

    const event = data?.event ?? null;
    const eventSnapshot = data?.eventSnapshot ?? null;

    const eventName =
      pickFirstString(type) ??
      pickFirstString(eventSnapshot?.name) ??
      pickFirstString(event?.name) ??
      pickFirstString(eventSnapshot?.type) ??
      pickFirstString(event?.type) ??
      "unknown";

    const url =
      pickFirstString(data?.url) ??
      pickFirstString(eventSnapshot?.url) ??
      pickFirstString(event?.context?.document?.location?.href) ??
      pickFirstString(event?.data?.context?.document?.location?.href) ??
      pickFirstString(event?.data?.url) ??
      null;

    const referrer =
      pickFirstString(data?.referrer) ??
      pickFirstString(eventSnapshot?.referrer) ??
      pickFirstString(event?.context?.document?.referrer) ??
      pickFirstString(event?.data?.context?.document?.referrer) ??
      pickFirstString(event?.data?.referrer) ??
      null;

    const host = pickFirstString(data?.host) ?? getHostFromUrl(url);
    const originHost = origin;

    const requestedShop = pickFirstString(data?.shop) || null;

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
      return corsify(request, json({ ok: false, error: "shop mismatch" }, { status: 403 }));
    }

    if (matchedSettings?.trackingEnabled === false) {
      return corsify(request, json({ ok: false, error: "tracking disabled" }, { status: 403 }));
    }

    let authMode = "legacy_open";

    if (matchedSettings?.trackingKey) {
      if (trackingKey === matchedSettings.trackingKey) {
        authMode = "tracking_key";
      } else if (requestedShop && matchedSettings.shop === requestedShop) {
        authMode = "shop_only_missing_key_allowed";
        console.log("[/api/track] missing tracking key, allowing storefront event", {
          requestedShop,
          matchedShop: matchedSettings.shop,
        });
      } else {
        console.error("[/api/track] invalid tracking key", {
          requestedShop,
          matchedShop: matchedSettings.shop,
          hasTrackingKey: Boolean(trackingKey),
        });
        return corsify(request, json({ ok: false, error: "invalid tracking key" }, { status: 403 }));
      }
    } else if (matchedSettings) {
      authMode = "shop_only";
    }

    const resolvedShop = matchedSettings?.shop || requestedShop || inferredStorefrontHost || null;

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
      eventType: data?.event?.type ?? null,
      eventName: data?.event?.name ?? null,
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
      orderId: data?.orderId ?? null,
      value: data?.value ?? data?.totalValue ?? null,
      currency: data?.currency ?? null,
      email: data?.email ?? null,
      phone: data?.phone ?? null,
      authMode,
      normalizedEvent,
    });

    const { utmSource, utmMedium, utmCampaign } = getUtmFromUrl(url || "");

    const visitorId = pickFirstString(data?.visitorId);
    const sessionId = pickFirstString(data?.sessionId);
    const eventId = pickFirstString(data?.eventId) ?? pickFirstString(eventSnapshot?.id) ?? null;

    const accountId = pickFirstString(data?.accountID) || pickFirstString(data?.accountId);

    const clickIds = data?.clickIds ?? {};
    let fbclid = pickFirstString(clickIds?.fbclid) || pickFirstString(data?.fbclid) || null;

    let gclid = pickFirstString(clickIds?.gclid) || pickFirstString(data?.gclid) || null;

    let ttclid = pickFirstString(clickIds?.ttclid) || pickFirstString(data?.ttclid) || null;

    let msclkid = pickFirstString(clickIds?.msclkid) || pickFirstString(data?.msclkid) || null;

    let fbp = pickFirstString(data?.fbp);
    let fbc = pickFirstString(data?.fbc);

    try {
      await db.trackedEvent.create({
        data: {
          eventName,
          createdAt: new Date(),
          url,
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

    const possibleOrderId =
      normalizeOrderId(data?.orderId) ||
      normalizeOrderId(eventSnapshot?.orderId) ||
      normalizeOrderId(event?.orderId) ||
      normalizeOrderId(event?.data?.orderId) ||
      normalizeOrderId(event?.data?.order?.id) ||
      normalizeOrderId(event?.data?.checkout?.order?.id) ||
      null;

    const possibleTotal =
      pickFirstNumber(data?.totalValue) ??
      pickFirstNumber(data?.value) ??
      pickFirstNumber(eventSnapshot?.totalValue) ??
      pickFirstNumber(eventSnapshot?.value) ??
      pickFirstNumber(event?.value) ??
      pickFirstNumber(event?.data?.totalPrice) ??
      pickFirstNumber(event?.data?.checkout?.totalPrice?.amount) ??
      pickFirstNumber(event?.data?.checkout?.totalPrice) ??
      null;

    const possibleCurrency =
      pickFirstString(data?.currency) ||
      pickFirstString(eventSnapshot?.currency) ||
      pickFirstString(event?.currency) ||
      pickFirstString(event?.data?.currency) ||
      pickFirstString(event?.data?.checkout?.currencyCode) ||
      pickFirstString(event?.data?.checkout?.currency) ||
      null;

    const possibleEmail =
      pickFirstString(data?.email) ||
      pickFirstString(eventSnapshot?.email) ||
      pickFirstString(event?.email) ||
      pickFirstString(event?.data?.email) ||
      pickFirstString(event?.data?.checkout?.email) ||
      null;

    const possiblePhone =
      pickFirstString(data?.phone) ||
      pickFirstString(eventSnapshot?.phone) ||
      pickFirstString(event?.phone) ||
      pickFirstString(event?.data?.phone) ||
      pickFirstString(event?.data?.checkout?.phone) ||
      null;

    const isPurchaseLike =
      ["purchase", "checkout_completed", "order_completed", "payment_completed"].includes(
        (eventName || "").toLowerCase(),
      ) ||
      ["purchase", "checkout_completed", "order_completed", "payment_completed"].includes(
        (type || "").toLowerCase(),
      );

    if (possibleOrderId && isPurchaseLike) {
      const fallbackContext = await findLatestBrowserContext({
        shop: resolvedShop,
        visitorId,
        sessionId,
        fbp,
        fbc,
        fbclid,
        gclid,
        ttclid,
        msclkid,
        currentUrl: url,
        referrer,
      });

      if (!fbp && fallbackContext?.fbp) fbp = fallbackContext.fbp;
      if (!fbc && fallbackContext?.fbc) fbc = fallbackContext.fbc;
      if (!fbclid && fallbackContext?.fbclid) fbclid = fallbackContext.fbclid;
      if (!gclid && fallbackContext?.gclid) gclid = fallbackContext.gclid;
      if (!ttclid && fallbackContext?.ttclid) ttclid = fallbackContext.ttclid;
      if (!msclkid && fallbackContext?.msclkid) msclkid = fallbackContext.msclkid;

      const finalUtmSource = utmSource ?? fallbackContext?.utmSource ?? null;
      const finalUtmMedium = utmMedium ?? fallbackContext?.utmMedium ?? null;
      const finalUtmCampaign = utmCampaign ?? fallbackContext?.utmCampaign ?? null;

      const fallbackComparableUrl = normalizeComparableUrl(fallbackContext?.url ?? null);
      const purchaseComparableReferrer = normalizeComparableUrl(referrer ?? null);

      const finalLandingPage =
        fallbackContext?.eventName === "browser_context_sync"
          ? (fallbackContext?.url ?? url ?? null)
          : fallbackComparableUrl && purchaseComparableReferrer && fallbackComparableUrl === purchaseComparableReferrer
            ? (fallbackContext?.url ?? url ?? null)
            : (url ?? fallbackContext?.url ?? null);

      const safeLandingPage = isCheckoutLikeUrl(finalLandingPage)
        ? (fallbackContext?.referrer ?? finalLandingPage ?? null)
        : finalLandingPage;

      const finalReferrer = referrer ?? fallbackContext?.referrer ?? null;

      console.log("[/api/track] purchase enrichment", {
        orderId: possibleOrderId,
        usedFallbackContext: Boolean(fallbackContext),
        fallbackEventName: fallbackContext?.eventName ?? null,
        fallbackUrl: fallbackContext?.url ?? null,
        fallbackReferrer: fallbackContext?.referrer ?? null,
        finalFbp: Boolean(fbp),
        finalFbc: Boolean(fbc),
        finalFbclid: Boolean(fbclid),
        finalGclid: Boolean(gclid),
        finalUtmSource,
        finalUtmMedium,
        finalUtmCampaign,
        safeLandingPage,
      });

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
          utmSource: finalUtmSource,
          utmMedium: finalUtmMedium,
          utmCampaign: finalUtmCampaign,
          fbclid,
          gclid,
          ttclid,
          msclkid,
          fbp,
          fbc,
          referrer: finalReferrer,
          landingPage: safeLandingPage,
        },
        update: {
          totalValue: possibleTotal ?? undefined,
          currency: possibleCurrency ?? undefined,
          shop: resolvedShop ?? undefined,
          visitorId: visitorId ?? undefined,
          sessionId: sessionId ?? undefined,
          utmSource: finalUtmSource ?? undefined,
          utmMedium: finalUtmMedium ?? undefined,
          utmCampaign: finalUtmCampaign ?? undefined,
          fbclid: fbclid ?? undefined,
          gclid: gclid ?? undefined,
          ttclid: ttclid ?? undefined,
          msclkid: msclkid ?? undefined,
          fbp: fbp ?? undefined,
          fbc: fbc ?? undefined,
          referrer: finalReferrer ?? undefined,
          landingPage: safeLandingPage ?? undefined,
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
          url: safeLandingPage,
          sourceUrl: safeLandingPage,
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

    return corsify(request, json({ ok: true, saved: true, eventName }, { status: 200 }));
  } catch (err: any) {
    console.error("[/api/track] error:", err?.message || err);
    return corsify(request, json({ ok: false, error: "server error" }, { status: 500 }));
  }
}