// extensions/attribix-pixel/src/index.ts
import { register } from "@shopify/web-pixels-extension";

/**
 * Attribix Web Pixel (instrumented + session upgrade + tracking key support)
 *
 * What this file does:
 * 1) Logs "pixel_boot"
 * 2) Sends a small "pixel_boot" event to /api/track
 * 3) Subscribes to common analytics events and forwards them to /api/track
 *
 * Additions in this version:
 * - visitorId (long-lived first-party style id when storage is available)
 * - sessionId (30-minute session window)
 * - eventId
 * - url + referrer
 * - click IDs (fbclid/gclid/ttclid/msclkid)
 * - fbp/fbc capture when possible
 * - optional trackingShop + trackingKey support for multi-shop validation
 */

type Settings = {
  accountID?: string;
  accountId?: string;
  trackingShop?: string;
  shop?: string;
  trackingKey?: string;
};

type TrackBody = {
  type: string;
  accountID?: string;
  accountId?: string;
  shop?: string | null;
  trackingKey?: string | null;
  event?: any;
  meta?: Record<string, any>;

  visitorId?: string;
  sessionId?: string;
  eventId?: string;
  url?: string | null;
  referrer?: string | null;
  host?: string | null;
  clickIds?: {
    fbclid?: string | null;
    gclid?: string | null;
    ttclid?: string | null;
    msclkid?: string | null;
  };
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

function getStorage(): Storage | null {
  try {
    // @ts-ignore
    return globalThis?.localStorage ?? null;
  } catch {
    return null;
  }
}

function getOrCreateVisitorId(): string {
  try {
    const ls = getStorage();
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
    const ls = getStorage();
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
    const ls = getStorage();
    if (!ls) return;
    ls.setItem(SESSION_KEY, sessionId);
    ls.setItem(SESSION_TOUCH_KEY, String(nowMs()));
  } catch {}
}

function safeGetUrlFromEventOrLocation(payload: any): string | null {
  try {
    const fromEvent = payload?.context?.document?.location?.href;
    if (typeof fromEvent === "string" && fromEvent) return fromEvent;
  } catch {}

  try {
    // @ts-ignore
    const href = globalThis?.location?.href;
    if (typeof href === "string" && href) return href;
  } catch {}

  return null;
}

function safeGetReferrer(): string | null {
  try {
    // @ts-ignore
    const ref = globalThis?.document?.referrer;
    if (typeof ref === "string") return ref;
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

function getClickIds(url: string | null) {
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
    const payload = ev?.data ?? ev ?? null;

    sessionId = getOrCreateSessionId();
    touchSession(sessionId);

    const url = safeGetUrlFromEventOrLocation(payload);
    const referrer = safeGetReferrer();
    const host = getHost(url);
    const clickIds = getClickIds(url);
    const { fbp, fbc } = getFacebookBrowserIds(url);

    const body: TrackBody = {
      type,
      accountID,
      accountId: accountID,
      shop: trackingShop,
      trackingKey,
      event: payload,
      visitorId,
      sessionId,
      eventId: `e_${uuid()}`,
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
      },
    };

    const jsonBody = safeJson(body);

    try {
      if ("sendBeacon" in navigator) {
        const blob = new Blob([jsonBody], { type: "application/json" });
        const ok = (navigator as any).sendBeacon(TRACK_URL, blob);
        console.log("[attribix pixel] sendBeacon", {
          type,
          ok,
          sessionId,
          trackingShop,
          hasTrackingKey: Boolean(trackingKey),
        });
        return;
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
        console.log("[attribix pixel] event", name);
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

  // Optional:
  // sub("cart_viewed");
  // sub("checkout_completed");
});