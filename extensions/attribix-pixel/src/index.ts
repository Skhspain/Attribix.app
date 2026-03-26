// extensions/attribix-pixel/src/index.ts
import { register } from "@shopify/web-pixels-extension";

/**
 * Attribix Web Pixel
 *
 * What this file does:
 * 1) Sends "pixel_boot"
 * 2) Subscribes to storefront + checkout events
 * 3) Forwards both the raw event and a flattened eventSnapshot to /api/track
 *
 * Goals of this version:
 * - Preserve the full Shopify event object
 * - Also send a normalized eventSnapshot for easier backend parsing
 * - Capture visitorId, sessionId, eventId, url, referrer, click IDs
 * - Subscribe to checkout_completed so purchases can be captured
 * - Make checkout flow session IDs more stable by deriving a checkout session key
 * - Preserve multi-shop fields (trackingShop / trackingKey) when available
 * - Use the same visitor/session identity logic as attribix.browser-track.jsx
 */

type Settings = {
  accountID?: string;
  accountId?: string;
  trackingShop?: string;
  shop?: string;
  trackingKey?: string;
};

type ClickIds = {
  fbclid?: string | null;
  gclid?: string | null;
  ttclid?: string | null;
  msclkid?: string | null;
};

type EventSnapshot = {
  id?: string | null;
  name?: string | null;
  type?: string | null;
  timestamp?: string | number | null;

  url?: string | null;
  referrer?: string | null;

  orderId?: string | null;
  checkoutId?: string | null;

  value?: number | null;
  totalValue?: number | null;
  currency?: string | null;

  email?: string | null;
  phone?: string | null;
};

type TrackBody = {
  type: string;
  accountID?: string;
  accountId?: string;
  shop?: string | null;
  trackingKey?: string | null;

  event?: any;
  eventSnapshot?: EventSnapshot | null;
  meta?: Record<string, any>;

  visitorId?: string;
  sessionId?: string;
  eventId?: string;
  url?: string | null;
  referrer?: string | null;
  host?: string | null;
  clickIds?: ClickIds;
  fbp?: string | null;
  fbc?: string | null;
};

const TRACK_URL = "https://attribix-app.fly.dev/api/track";
const VISITOR_KEY = "attribix_visitor_id";
const SESSION_KEY = "attribix_session_id";
const SESSION_TOUCH_KEY = "attribix_session_last_touch";
const SESSION_TIMEOUT_MS = 30 * 60 * 1000;

function safeJson(obj: any) {
  try {
    return JSON.stringify(obj);
  } catch {
    return JSON.stringify({ error: "json_stringify_failed" });
  }
}

function nowIso() {
  try {
    return new Date().toISOString();
  } catch {
    return "";
  }
}

function nowMs() {
  try {
    return Date.now();
  } catch {
    return 0;
  }
}

function uuid(): string {
  try {
    // @ts-ignore
    if (globalThis?.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  } catch {}
  return `ev_${Math.random().toString(16).slice(2)}_${Date.now()}`;
}

function getLocalStorage(): Storage | null {
  try {
    // @ts-ignore
    return globalThis?.localStorage ?? null;
  } catch {
    return null;
  }
}

function safePickString(value: any): string | null {
  try {
    if (typeof value === "string" && value.trim()) return value.trim();
  } catch {}
  return null;
}

function safePickNumber(value: any): number | null {
  try {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim()) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  } catch {}
  return null;
}

function getOrCreateVisitorId(): string {
  try {
    const ls = getLocalStorage();
    if (ls) {
      const existing = ls.getItem(VISITOR_KEY);
      if (existing && existing.length > 10) return existing;

      const created = `v_${uuid()}`;
      ls.setItem(VISITOR_KEY, created);
      return created;
    }
  } catch {}

  return `v_${uuid()}`;
}

function getOrCreateSessionId(): string {
  try {
    const ls = getLocalStorage();
    if (ls) {
      const existingSessionId = ls.getItem(SESSION_KEY);
      const existingTouchRaw = ls.getItem(SESSION_TOUCH_KEY);
      const existingTouch = existingTouchRaw ? Number(existingTouchRaw) : 0;
      const age = nowMs() - existingTouch;

      if (
        existingSessionId &&
        existingSessionId.length > 10 &&
        Number.isFinite(existingTouch) &&
        age >= 0 &&
        age < SESSION_TIMEOUT_MS
      ) {
        ls.setItem(SESSION_TOUCH_KEY, String(nowMs()));
        return existingSessionId;
      }

      const created = `s_${uuid()}`;
      ls.setItem(SESSION_KEY, created);
      ls.setItem(SESSION_TOUCH_KEY, String(nowMs()));
      return created;
    }
  } catch {}

  return `s_${uuid()}`;
}

function touchSession(sessionId: string) {
  try {
    const ls = getLocalStorage();
    if (!ls) return;
    ls.setItem(SESSION_KEY, sessionId);
    ls.setItem(SESSION_TOUCH_KEY, String(nowMs()));
  } catch {}
}

function safeGetUrlFromEventOrLocation(ev: any): string | null {
  try {
    const candidates = [
      ev?.context?.document?.location?.href,
      ev?.document?.location?.href,
      ev?.data?.context?.document?.location?.href,
      ev?.data?.document?.location?.href,
      ev?.data?.url,
      ev?.url,
    ];

    for (const candidate of candidates) {
      if (typeof candidate === "string" && candidate) return candidate;
    }
  } catch {}

  try {
    // @ts-ignore
    const href = globalThis?.location?.href;
    if (typeof href === "string" && href) return href;
  } catch {}

  return null;
}

function safeGetReferrerFromEventOrDocument(ev: any): string | null {
  try {
    const candidates = [
      ev?.context?.document?.referrer,
      ev?.document?.referrer,
      ev?.data?.context?.document?.referrer,
      ev?.data?.document?.referrer,
      ev?.data?.referrer,
      ev?.referrer,
    ];

    for (const candidate of candidates) {
      if (typeof candidate === "string") {
        const trimmed = candidate.trim();
        return trimmed || null;
      }
    }
  } catch {}

  try {
    // @ts-ignore
    const ref = globalThis?.document?.referrer;
    if (typeof ref === "string") {
      const trimmed = ref.trim();
      return trimmed || null;
    }
  } catch {}

  return null;
}

function safeGetCookie(name: string): string | null {
  try {
    // @ts-ignore
    const cookie = globalThis?.document?.cookie;
    if (!cookie || typeof cookie !== "string") return null;

    const parts = cookie.split(";").map((p) => p.trim());
    const found = parts.find((p) => p.startsWith(`${name}=`));
    if (!found) return null;

    return decodeURIComponent(found.slice(name.length + 1));
  } catch {
    return null;
  }
}

function getHost(url: string | null): string | null {
  try {
    if (!url) return null;
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

function getClickIds(url: string | null): ClickIds {
  try {
    if (!url) return { fbclid: null, gclid: null, ttclid: null, msclkid: null };
    const u = new URL(url);
    return {
      fbclid: u.searchParams.get("fbclid"),
      gclid: u.searchParams.get("gclid"),
      ttclid: u.searchParams.get("ttclid"),
      msclkid: u.searchParams.get("msclkid"),
    };
  } catch {
    return { fbclid: null, gclid: null, ttclid: null, msclkid: null };
  }
}

function buildFbcFromFbclid(fbclid?: string | null): string | null {
  if (!fbclid) return null;
  return `fb.1.${Date.now()}.${fbclid}`;
}

function getFacebookBrowserIds(url: string | null) {
  const clickIds = getClickIds(url);
  const cookieFbp = safeGetCookie("_fbp");
  const cookieFbc = safeGetCookie("_fbc");

  return {
    fbp: cookieFbp || null,
    fbc: cookieFbc || buildFbcFromFbclid(clickIds.fbclid),
  };
}

function getCheckoutIdFromUrl(url: string | null): string | null {
  try {
    if (!url) return null;
    const u = new URL(url);
    const match = u.pathname.match(/\/checkouts\/(?:cn\/)?([^/]+)/i);
    return match?.[1] || null;
  } catch {
    return null;
  }
}

function getBestCheckoutId(ev: any, url: string | null): string | null {
  return (
    safePickString(ev?.data?.checkout?.id) ||
    safePickString(ev?.checkout?.id) ||
    safePickString(ev?.data?.checkoutId) ||
    safePickString(ev?.checkoutId) ||
    getCheckoutIdFromUrl(url)
  );
}

function buildCheckoutScopedSessionId(type: string, ev: any, url: string | null): string | null {
  const checkoutId = getBestCheckoutId(ev, url);
  if (!checkoutId) return null;

  const lowerType = String(type || "").toLowerCase();
  const isCheckoutFlow = lowerType.includes("checkout") || (url ? /\/checkouts\//i.test(url) : false);

  if (!isCheckoutFlow) return null;

  return `chk_${checkoutId}`;
}

function buildEventSnapshot(
  ev: any,
  type: string,
  resolvedUrl: string | null,
  resolvedReferrer: string | null,
): EventSnapshot {
  const checkoutId = getBestCheckoutId(ev, resolvedUrl);

  return {
    id: safePickString(ev?.id) ?? safePickString(ev?.data?.id) ?? null,

    name: safePickString(ev?.name) ?? safePickString(ev?.data?.name) ?? safePickString(type) ?? null,

    type: safePickString(ev?.type) ?? safePickString(ev?.data?.type) ?? "standard",

    timestamp: safePickString(ev?.timestamp) ?? safePickString(ev?.data?.timestamp) ?? null,

    url: resolvedUrl,
    referrer: resolvedReferrer,

    orderId:
      safePickString(ev?.data?.orderId) ||
      safePickString(ev?.data?.order?.id) ||
      safePickString(ev?.data?.checkout?.order?.id) ||
      safePickString(ev?.orderId) ||
      null,

    checkoutId,

    value:
      safePickNumber(ev?.data?.value) ??
      safePickNumber(ev?.value) ??
      safePickNumber(ev?.data?.checkout?.totalPrice?.amount) ??
      safePickNumber(ev?.data?.checkout?.totalPrice) ??
      safePickNumber(ev?.data?.totalPrice?.amount) ??
      safePickNumber(ev?.data?.totalPrice) ??
      null,

    totalValue:
      safePickNumber(ev?.data?.totalValue) ??
      safePickNumber(ev?.data?.checkout?.totalPrice?.amount) ??
      safePickNumber(ev?.data?.checkout?.totalPrice) ??
      safePickNumber(ev?.data?.totalPrice?.amount) ??
      safePickNumber(ev?.data?.totalPrice) ??
      safePickNumber(ev?.data?.subtotalPrice?.amount) ??
      safePickNumber(ev?.data?.subtotalPrice) ??
      null,

    currency:
      safePickString(ev?.data?.currency) ||
      safePickString(ev?.data?.checkout?.currencyCode) ||
      safePickString(ev?.data?.checkout?.totalPrice?.currencyCode) ||
      safePickString(ev?.data?.totalPrice?.currencyCode) ||
      safePickString(ev?.currency) ||
      null,

    email:
      safePickString(ev?.data?.email) ||
      safePickString(ev?.data?.checkout?.email) ||
      safePickString(ev?.email) ||
      null,

    phone:
      safePickString(ev?.data?.phone) ||
      safePickString(ev?.data?.checkout?.phone) ||
      safePickString(ev?.phone) ||
      null,
  };
}

export default register(({ analytics, settings }) => {
  const typedSettings = (settings as Settings) ?? {};

  const accountID = typedSettings.accountID ?? typedSettings.accountId;
  const trackingShop = typedSettings.trackingShop ?? typedSettings.shop ?? null;
  const trackingKey = typedSettings.trackingKey ?? null;

  const visitorId = getOrCreateVisitorId();
  let sessionId = getOrCreateSessionId();

  console.log("[attribix pixel] boot", {
    hasSettings: !!settings,
    settings,
    accountID,
    trackingShop,
    hasTrackingKey: Boolean(trackingKey),
    t: nowIso(),
    visitorId,
    sessionId,
  });

  async function post(type: string, ev?: any, meta?: Record<string, any>) {
    const url = safeGetUrlFromEventOrLocation(ev);
    const referrer = safeGetReferrerFromEventOrDocument(ev);
    const host = getHost(url);
    const clickIds = getClickIds(url);
    const { fbp, fbc } = getFacebookBrowserIds(url);
    const eventId = `e_${uuid()}`;

    const checkoutScopedSessionId = buildCheckoutScopedSessionId(type, ev, url);
    sessionId = checkoutScopedSessionId || getOrCreateSessionId();
    touchSession(sessionId);

    const eventSnapshot = buildEventSnapshot(ev, type, url, referrer);

    const body: TrackBody = {
      type,
      accountID,
      accountId: accountID,
      shop: trackingShop,
      trackingKey,

      event: ev ?? null,
      eventSnapshot,
      visitorId,
      sessionId,
      eventId,
      url,
      referrer,
      host,
      clickIds,
      fbp,
      fbc,

      meta: {
        ...meta,
        t: nowIso(),
        hasAccountID: Boolean(accountID),
        hasTrackingKey: Boolean(trackingKey),
        hasTrackingShop: Boolean(trackingShop),
        checkoutScopedSessionId: checkoutScopedSessionId || null,
      },
    };

    const jsonBody = safeJson(body);

    console.log("[attribix pixel] outbound", {
      type,
      eventId,
      visitorId,
      sessionId,
      url,
      referrer,
      host,
      clickIds,
      hasFbp: Boolean(fbp),
      hasFbc: Boolean(fbc),
      trackingShop,
      hasTrackingKey: Boolean(trackingKey),
      topLevelKeys: Object.keys(body),
      eventSnapshot,
    });

    try {
      if ("sendBeacon" in navigator) {
        const blob = new Blob([jsonBody], { type: "application/json" });
        const ok = (navigator as any).sendBeacon(TRACK_URL, blob);

        console.log("[attribix pixel] sendBeacon", {
          type,
          ok,
          eventId,
          sessionId,
          trackingShop,
          hasTrackingKey: Boolean(trackingKey),
        });

        if (ok) return;
      }
    } catch (e) {
      console.log("[attribix pixel] sendBeacon error", String((e as any)?.message || e));
    }

    try {
      const res = await fetch(TRACK_URL, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: jsonBody,
        keepalive: true,
      });

      console.log("[attribix pixel] fetch", {
        type,
        status: res.status,
        eventId,
        sessionId,
        trackingShop,
        hasTrackingKey: Boolean(trackingKey),
      });
    } catch (e) {
      console.log("[attribix pixel] fetch error", {
        type,
        err: String((e as any)?.message || e),
      });
    }
  }

  void post("pixel_boot", null, { reason: "pixel_loaded" });

  const sub = (name: string) => {
    try {
      analytics.subscribe(name as any, (e: any) => {
        console.log("[attribix pixel] event", name, {
          hasEvent: Boolean(e),
          eventKeys: e ? Object.keys(e) : [],
          dataKeys: e?.data ? Object.keys(e.data) : [],
        });

        void post(name, e);
      });
    } catch (e) {
      console.log("[attribix pixel] subscribe error", {
        name,
        err: String((e as any)?.message || e),
      });
    }
  };

  sub("page_viewed");
  sub("product_viewed");
  sub("collection_viewed");
  sub("search_submitted");
  sub("checkout_started");
  sub("checkout_completed");

  // Optional:
  // sub("cart_viewed");
});