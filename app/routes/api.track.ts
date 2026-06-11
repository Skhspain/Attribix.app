import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { db } from "~/db.server";
import { sendServerConversions } from "~/services/serverConversions.server";
import { normalizeTrackedEvent } from "~/services/trackingNormalizer.server";
import { touchTrackingHealth } from "~/models/trackingSettings.server";
import { upsertTouchpoint } from "~/services/touchpoints.server";

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

function pickNumber(x: unknown): number | null {
  if (typeof x === "number" && Number.isFinite(x)) return x;
  if (typeof x === "string" && x.trim().length) {
    const n = Number(x);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/**
 * Extract order attribution data from event payload.
 *
 * Shopify web-pixel shape:
 *   event.data.checkout.order.id, event.data.checkout.totalPrice.{amount,currencyCode}
 * WooCommerce plugin shape (mirrors the above):
 *   event.data.checkout.orderId, event.data.checkout.totalPrice.{amount,currencyCode}
 */
function extractOrderAttribution(event: any): {
  orderId: string | null;
  revenue: number | null;
  currency: string | null;
} {
  const checkout = event?.data?.checkout ?? null;
  if (!checkout) return { orderId: null, revenue: null, currency: null };

  const orderId =
    pickFirstString(checkout?.order?.id) ??
    pickFirstString(checkout?.orderId) ??
    (typeof checkout?.order?.id === "number" ? String(checkout.order.id) : null) ??
    (typeof checkout?.orderId === "number" ? String(checkout.orderId) : null);

  const revenue =
    pickNumber(checkout?.totalPrice?.amount) ??
    pickNumber(checkout?.totalPrice) ??
    null;

  const currency =
    pickFirstString(checkout?.totalPrice?.currencyCode) ??
    pickFirstString(checkout?.currencyCode) ??
    null;

  return { orderId, revenue, currency };
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

function getClickIdsFromUrl(url: string | null) {
  try {
    if (!url) {
      return {
        fbclid: null,
        gclid: null,
        ttclid: null,
        msclkid: null,
      };
    }

    const u = new URL(url);
    return {
      fbclid: u.searchParams.get("fbclid"),
      gclid: u.searchParams.get("gclid"),
      ttclid: u.searchParams.get("ttclid"),
      msclkid: u.searchParams.get("msclkid"),
    };
  } catch {
    return {
      fbclid: null,
      gclid: null,
      ttclid: null,
      msclkid: null,
    };
  }
}

function buildFbcFromFbclid(fbclid: string | null): string | null {
  if (!fbclid) return null;
  return `fb.1.${Date.now()}.${fbclid}`;
}

function getAttributionFromUrl(url: string | null) {
  const utm = getUtmFromUrl(url || "");
  const clickIds = getClickIdsFromUrl(url);

  return {
    utmSource: utm.utmSource,
    utmMedium: utm.utmMedium,
    utmCampaign: utm.utmCampaign,
    fbclid: clickIds.fbclid,
    gclid: clickIds.gclid,
    ttclid: clickIds.ttclid,
    msclkid: clickIds.msclkid,
    fbc: clickIds.fbclid ? buildFbcFromFbclid(clickIds.fbclid) : null,
  };
}

function firstNonEmptyString(...values: Array<string | null | undefined>) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
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

// Cart and thank-you pages are transactional — not useful as attribution landing pages
function isTransactionalUrl(url: string | null): boolean {
  const path = getUrlPath(url);
  if (!path) return false;
  return (
    path === "/cart" ||
    path.startsWith("/cart/") ||
    path.includes("/checkouts/") ||
    path.includes("/thank_you") ||
    path.includes("/orders/")
  );
}

function isWebPixelSandboxUrl(url: string | null): boolean {
  if (!url) return false;
  return url.includes("/web-pixels");
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

function urlHasAttribution(url: string | null): boolean {
  const parsed = getAttributionFromUrl(url);
  return Boolean(
    parsed.utmSource ||
      parsed.utmMedium ||
      parsed.utmCampaign ||
      parsed.fbclid ||
      parsed.gclid ||
      parsed.ttclid ||
      parsed.msclkid ||
      parsed.fbc,
  );
}

function chooseBestAttributionUrl(input: {
  currentUrl?: string | null;
  currentReferrer?: string | null;
  fallbackUrl?: string | null;
  fallbackReferrer?: string | null;
}) {
  const { currentUrl, currentReferrer, fallbackUrl, fallbackReferrer } = input;

  const candidates = [
    currentUrl,
    currentReferrer,
    fallbackUrl,
    fallbackReferrer,
  ].filter(Boolean) as string[];

  for (const candidate of candidates) {
    if (!isTransactionalUrl(candidate) && !isWebPixelSandboxUrl(candidate) && urlHasAttribution(candidate)) {
      return candidate;
    }
  }

  for (const candidate of candidates) {
    if (!isTransactionalUrl(candidate) && !isWebPixelSandboxUrl(candidate)) {
      return candidate;
    }
  }

  return firstNonEmptyString(currentUrl, currentReferrer, fallbackUrl, fallbackReferrer);
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
  ip?: string | null;
  attributionWindowDays?: number | null;
  attributionModel?: string | null;
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
    ip,
    attributionWindowDays,
    attributionModel,
  } = input;

  if (!shop) return null;

  const comparableCurrentUrl = normalizeComparableUrl(currentUrl ?? null);
  const comparableReferrer = normalizeComparableUrl(referrer ?? null);
  const currentPath = getUrlPath(currentUrl ?? null);
  const referrerPath = getUrlPath(referrer ?? null);

  // IP correlation uses a shorter 2-hour window to avoid false positives
  // on shared IPs (NAT, office networks, mobile carriers).
  const ipCutoff = new Date(Date.now() - 2 * 60 * 60 * 1000);

  const orClauses = [
    visitorId ? { visitorId } : undefined,
    sessionId ? { sessionId } : undefined,
    fbp ? { fbp } : undefined,
    fbc ? { fbc } : undefined,
    fbclid ? { fbclid } : undefined,
    gclid ? { gclid } : undefined,
    ttclid ? { ttclid } : undefined,
    msclkid ? { msclkid } : undefined,
    // IP-based correlation: bridges pixel sandbox visitorId fragmentation.
    // Uses a short 2-hour window to limit false positives on shared IPs.
    ip ? { ip, createdAt: { gte: ipCutoff } } : undefined,
  ].filter(Boolean) as any[];

  const windowDays = Math.max(1, Math.min(90, attributionWindowDays ?? 7));
  const recentCutoff = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);

  const whereOr: any[] = [
    ...orClauses,
    ...(comparableCurrentUrl ? [{ url: { startsWith: comparableCurrentUrl } }] : []),
    ...(comparableReferrer ? [{ url: { startsWith: comparableReferrer } }] : []),
    ...(comparableReferrer ? [{ referrer: { startsWith: comparableReferrer } }] : []),
  ];

  const rows = await db.trackedEvent.findMany({
    where: {
      shop,
      createdAt: {
        gte: recentCutoff,
      },
      ...(whereOr.length ? { OR: whereOr } : {}),
    },
    orderBy: {
      createdAt: "desc",
    },
    take: 300,
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
      ip: true,
    },
  });

  const usableRows = rows.filter((row) => {
    const rowUrl = row.url ?? "";

    if (row.eventName === "pixel_boot") return false;
    if (isWebPixelSandboxUrl(rowUrl)) return false;
    if (isTransactionalUrl(rowUrl)) return false;

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
      const rowUrlIsCheckoutLike = isTransactionalUrl(row.url ?? null);
      const rowReferrerIsCheckoutLike = isTransactionalUrl(row.referrer ?? null);

      if (row.eventName === "browser_context_sync") score += 200;
      if (row.eventName === "product_viewed") score += 120;
      if (row.eventName === "page_viewed") score += 40;
      if (row.eventName === "checkout_started") score -= 20;
      if (row.eventName === "checkout_completed") score -= 40;

      if (visitorId && row.visitorId === visitorId) score += 20;
      if (sessionId && row.sessionId === sessionId) score += 20;
      if (ip && (row as any).ip === ip) score += 15;
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

      if (comparableReferrer && rowComparableUrl === comparableReferrer) score += 300;
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
    });

  // For first-touch: among equally-scored rows, prefer the OLDEST (first entry point).
  // For last-touch (default): prefer the NEWEST.
  const isFirstTouch = attributionModel === "first_touch";

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const aTime = Number(new Date(a.row.createdAt));
    const bTime = Number(new Date(b.row.createdAt));
    return isFirstTouch ? aTime - bTime : bTime - aTime;
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
    const earlyAccountId = pickFirstString(data?.accountID) || pickFirstString(data?.accountId) || null;

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

    if (!matchedSettings && earlyAccountId) {
      matchedSettings = await db.trackingSettings.findUnique({
        where: { shop: earlyAccountId },
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
      } else if (
        (requestedShop && matchedSettings.shop === requestedShop) ||
        (earlyAccountId && matchedSettings.shop === earlyAccountId)
      ) {
        // Allow events from a shop whose domain matches — this covers both:
        // - tracker.liquid sending data.shop = shop domain
        // - Shopify Web Pixel sending data.accountID = shop domain (no tracking key in pixel settings)
        authMode = "shop_only_missing_key_allowed";
        console.log("[/api/track] missing tracking key, allowing storefront event", {
          requestedShop,
          earlyAccountId,
          matchedShop: matchedSettings.shop,
        });
      } else {
        console.error("[/api/track] invalid tracking key", {
          requestedShop,
          matchedShop: matchedSettings.shop,
          hasTrackingKey: Boolean(trackingKey),
        });
        return corsify(
          request,
          json({ ok: false, error: "invalid tracking key" }, { status: 403 }),
        );
      }
    } else if (matchedSettings) {
      authMode = "shop_only";
    }

    // earlyAccountId is the shop domain pushed by the pixel extension settings (accountID = shop).
    // Include it in resolvedShop so pixel events can be attributed even before a TrackingSettings row exists.
    const resolvedShop = matchedSettings?.shop || requestedShop || earlyAccountId || inferredStorefrontHost || null;

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

    const urlAttribution = getAttributionFromUrl(url);
    const referrerAttribution = getAttributionFromUrl(referrer);

    const utmSource =
      urlAttribution.utmSource ??
      referrerAttribution.utmSource ??
      null;

    const utmMedium =
      urlAttribution.utmMedium ??
      referrerAttribution.utmMedium ??
      null;

    const utmCampaign =
      urlAttribution.utmCampaign ??
      referrerAttribution.utmCampaign ??
      null;

    const visitorId = pickFirstString(data?.visitorId);
    const sessionId = pickFirstString(data?.sessionId);
    const eventId = pickFirstString(data?.eventId) ?? pickFirstString(eventSnapshot?.id) ?? null;

    const accountId = pickFirstString(data?.accountID) || pickFirstString(data?.accountId);

    const clickIds = data?.clickIds ?? {};
    let fbclid =
      pickFirstString(clickIds?.fbclid) ||
      pickFirstString(data?.fbclid) ||
      urlAttribution.fbclid ||
      referrerAttribution.fbclid ||
      null;
    let gclid =
      pickFirstString(clickIds?.gclid) ||
      pickFirstString(data?.gclid) ||
      urlAttribution.gclid ||
      referrerAttribution.gclid ||
      null;
    let ttclid =
      pickFirstString(clickIds?.ttclid) ||
      pickFirstString(data?.ttclid) ||
      urlAttribution.ttclid ||
      referrerAttribution.ttclid ||
      null;
    let msclkid =
      pickFirstString(clickIds?.msclkid) ||
      pickFirstString(data?.msclkid) ||
      urlAttribution.msclkid ||
      referrerAttribution.msclkid ||
      null;

    let fbp = pickFirstString(data?.fbp);
    let fbc =
      pickFirstString(data?.fbc) ||
      urlAttribution.fbc ||
      referrerAttribution.fbc ||
      null;

    if (!fbc && fbclid) {
      fbc = buildFbcFromFbclid(fbclid);
    }

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

    // Update pixel health for any resolved shop — including when no settings row exists yet.
    // touchTrackingHealth will create the row if missing, so pixelLastSeenAt gets set on first event.
    // Both pixel_boot (web pixel extension) and page_view (tracker.liquid App Embed) signal
    // that storefront tracking is active.
    if (resolvedShop) {
      try {
        await touchTrackingHealth(resolvedShop, {
          pixelSeen: type === "pixel_boot" || type === "page_view",
        });
      } catch (healthError: any) {
        console.error("[/api/track] touchTrackingHealth error:", healthError?.message || healthError);
      }
    }

    // ── Upsert touchpoint for multi-touch attribution journey ──
    if (resolvedShop && visitorId && sessionId) {
      upsertTouchpoint({
        shop:        resolvedShop,
        visitorId,
        sessionId,
        utmSource,
        utmMedium,
        utmCampaign,
        fbclid,
        gclid,
        ttclid,
        msclkid,
        referrer,
        landingPage: url,
      }).catch(() => null); // fire-and-forget, non-fatal
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

    // ── InitiateCheckout server-side CAPI ────────────────────────────────
    // checkout_started events carry the customer's email — forward to Meta CAPI
    // so that the InitiateCheckout EMQ benefits from the same server-side match
    // quality as Purchase (where we already have email from the order).
    const isCheckoutStart =
      ["checkout_started", "checkout_start", "initiate_checkout"].includes((eventName || "").toLowerCase()) ||
      ["checkout_started", "checkout_start", "initiate_checkout"].includes((type || "").toLowerCase());

    if (isCheckoutStart && possibleEmail) {
      try {
        await sendServerConversions({
          eventName: "InitiateCheckout",
          eventTime: Math.floor(Date.now() / 1000),
          eventId: eventId || `checkout_start_${sessionId}`,
          value: possibleTotal ?? undefined,
          currency: possibleCurrency ?? "USD",
          url: url || undefined,
          sourceUrl: url || undefined,
          actionSource: "website",
          shop: resolvedShop,
          ip,
          userAgent: ua,
          email: possibleEmail,
          phone: possiblePhone ?? undefined,
          fbclid,
          fbp,
          fbc,
          externalId: visitorId,
          shopPixelId: matchedSettings?.fbPixelId,
          shopToken: matchedSettings?.fbToken,
        });
      } catch (e: any) {
        console.error("[/api/track] InitiateCheckout CAPI error:", e?.message);
      }
    }

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
        ip,
        attributionWindowDays: matchedSettings?.attributionWindowDays ?? 7,
        attributionModel: matchedSettings?.attributionModel ?? "last_touch",
      });

      const currentUrlAttribution = getAttributionFromUrl(url);
      const currentReferrerAttribution = getAttributionFromUrl(referrer);
      const fallbackUrlAttribution = getAttributionFromUrl(fallbackContext?.url ?? null);
      const fallbackReferrerAttribution = getAttributionFromUrl(fallbackContext?.referrer ?? null);

      if (!fbp && fallbackContext?.fbp) fbp = fallbackContext.fbp;

      if (!fbc) {
        fbc =
          fallbackContext?.fbc ||
          currentUrlAttribution.fbc ||
          currentReferrerAttribution.fbc ||
          fallbackUrlAttribution.fbc ||
          fallbackReferrerAttribution.fbc ||
          null;
      }

      if (!fbclid) {
        fbclid =
          fallbackContext?.fbclid ||
          currentUrlAttribution.fbclid ||
          currentReferrerAttribution.fbclid ||
          fallbackUrlAttribution.fbclid ||
          fallbackReferrerAttribution.fbclid ||
          null;
      }

      if (!gclid) {
        gclid =
          fallbackContext?.gclid ||
          currentUrlAttribution.gclid ||
          currentReferrerAttribution.gclid ||
          fallbackUrlAttribution.gclid ||
          fallbackReferrerAttribution.gclid ||
          null;
      }

      if (!ttclid) {
        ttclid =
          fallbackContext?.ttclid ||
          currentUrlAttribution.ttclid ||
          currentReferrerAttribution.ttclid ||
          fallbackUrlAttribution.ttclid ||
          fallbackReferrerAttribution.ttclid ||
          null;
      }

      if (!msclkid) {
        msclkid =
          fallbackContext?.msclkid ||
          currentUrlAttribution.msclkid ||
          currentReferrerAttribution.msclkid ||
          fallbackUrlAttribution.msclkid ||
          fallbackReferrerAttribution.msclkid ||
          null;
      }

      if (!fbc && fbclid) {
        fbc = buildFbcFromFbclid(fbclid);
      }

      const finalUtmSource =
        utmSource ??
        fallbackContext?.utmSource ??
        currentUrlAttribution.utmSource ??
        currentReferrerAttribution.utmSource ??
        fallbackUrlAttribution.utmSource ??
        fallbackReferrerAttribution.utmSource ??
        null;

      const finalUtmMedium =
        utmMedium ??
        fallbackContext?.utmMedium ??
        currentUrlAttribution.utmMedium ??
        currentReferrerAttribution.utmMedium ??
        fallbackUrlAttribution.utmMedium ??
        fallbackReferrerAttribution.utmMedium ??
        null;

      const finalUtmCampaign =
        utmCampaign ??
        fallbackContext?.utmCampaign ??
        currentUrlAttribution.utmCampaign ??
        currentReferrerAttribution.utmCampaign ??
        fallbackUrlAttribution.utmCampaign ??
        fallbackReferrerAttribution.utmCampaign ??
        null;

      const attributedLandingPage = chooseBestAttributionUrl({
        currentUrl: url,
        currentReferrer: referrer,
        fallbackUrl: fallbackContext?.url ?? null,
        fallbackReferrer: fallbackContext?.referrer ?? null,
      });

      const fallbackComparableUrl = normalizeComparableUrl(fallbackContext?.url ?? null);
      const purchaseComparableReferrer = normalizeComparableUrl(referrer ?? null);

      const finalLandingPage =
        attributedLandingPage ||
        (fallbackContext?.eventName === "browser_context_sync"
          ? (fallbackContext?.url ?? url ?? null)
          : fallbackComparableUrl &&
              purchaseComparableReferrer &&
              fallbackComparableUrl === purchaseComparableReferrer
            ? (fallbackContext?.url ?? url ?? null)
            : (url ?? fallbackContext?.url ?? null));

      const safeLandingPage = isTransactionalUrl(finalLandingPage)
        ? firstNonEmptyString(
            attributedLandingPage,
            fallbackContext?.referrer ?? null,
            referrer,
            finalLandingPage ?? null,
          )
        : finalLandingPage;

      const finalReferrer = firstNonEmptyString(
        referrer,
        fallbackContext?.referrer ?? null,
        null,
      );

      console.log("[/api/track] purchase enrichment", {
        orderId: possibleOrderId,
        usedFallbackContext: Boolean(fallbackContext),
        fallbackEventName: fallbackContext?.eventName ?? null,
        fallbackUrl: fallbackContext?.url ?? null,
        fallbackReferrer: fallbackContext?.referrer ?? null,
        fallbackMatchedByIp: fallbackContext != null && (fallbackContext as any).ip === ip && ip != null,
        currentUrlAttribution,
        currentReferrerAttribution,
        fallbackUrlAttribution,
        fallbackReferrerAttribution,
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
        // Normalize GID (gid://shopify/Order/12345 → 12345) so event_id matches
        // the webhook's shopify_order_${numericId} format, enabling Meta dedup.
        const numericOrderId = possibleOrderId?.replace(/^gid:\/\/shopify\/Order\//i, "") ?? possibleOrderId;
        const purchaseEventId = numericOrderId ? `shopify_order_${numericOrderId}` : (eventId ?? undefined);

        const conversionResult = await sendServerConversions({
          eventName: "Purchase",
          eventTime: Math.floor(Date.now() / 1000),
          eventId: purchaseEventId,
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
          ttclid,
          externalId: visitorId,
          shopPixelId: matchedSettings?.fbPixelId,
          shopToken: matchedSettings?.fbToken,
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