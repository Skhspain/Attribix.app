const SCRIPT = String.raw`(() => {
  const TRACK_URL = "https://attribix-app.fly.dev/api/track";
  const VISITOR_KEY = "attribix_visitor_id";
  const SESSION_KEY = "attribix_session_id";
  const SESSION_TOUCH_KEY = "attribix_session_last_touch";
  const SESSION_TIMEOUT_MS = 30 * 60 * 1000;

  function nowMs() {
    try {
      return Date.now();
    } catch {
      return 0;
    }
  }

  function nowIso() {
    try {
      return new Date().toISOString();
    } catch {
      return "";
    }
  }

  function uuid() {
    try {
      if (globalThis?.crypto?.randomUUID) return globalThis.crypto.randomUUID();
    } catch {}
    return "ctx_" + Math.random().toString(16).slice(2) + "_" + Date.now();
  }

  function safeGetStorage() {
    try {
      return globalThis?.localStorage ?? null;
    } catch {
      return null;
    }
  }

  function safeGetCookie(name) {
    try {
      const cookie = document.cookie;
      if (!cookie || typeof cookie !== "string") return null;

      const parts = cookie.split(";").map((p) => p.trim());
      const found = parts.find((p) => p.startsWith(name + "="));
      if (!found) return null;

      return decodeURIComponent(found.slice(name.length + 1));
    } catch {
      return null;
    }
  }

  function safeGetReferrer() {
    try {
      if (typeof document.referrer !== "string") return null;
      const value = document.referrer.trim();
      return value || null;
    } catch {
      return null;
    }
  }

  function safeGetUrl() {
    try {
      return typeof location.href === "string" ? location.href : null;
    } catch {
      return null;
    }
  }

  function safeGetHost() {
    try {
      return typeof location.hostname === "string" ? location.hostname : null;
    } catch {
      return null;
    }
  }

  function getOrCreateVisitorId() {
    try {
      const ls = safeGetStorage();
      if (ls) {
        const existing = ls.getItem(VISITOR_KEY);
        if (existing && existing.length > 10) return existing;

        const created = "v_" + uuid();
        ls.setItem(VISITOR_KEY, created);
        return created;
      }
    } catch {}

    return "v_" + uuid();
  }

  function getOrCreateSessionId() {
    try {
      const ls = safeGetStorage();
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

        const created = "s_" + uuid();
        ls.setItem(SESSION_KEY, created);
        ls.setItem(SESSION_TOUCH_KEY, String(nowMs()));
        return created;
      }
    } catch {}

    return "s_" + uuid();
  }

  function touchSession(sessionId) {
    try {
      const ls = safeGetStorage();
      if (!ls) return;
      ls.setItem(SESSION_KEY, sessionId);
      ls.setItem(SESSION_TOUCH_KEY, String(nowMs()));
    } catch {}
  }

  function getClickIds(url) {
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

  function buildFbcFromFbclid(fbclid) {
    if (!fbclid) return null;
    return "fb.1." + Date.now() + "." + fbclid;
  }

  function getBrowserIds(url) {
    const clickIds = getClickIds(url);
    const cookieFbp = safeGetCookie("_fbp");
    const cookieFbc = safeGetCookie("_fbc");

    return {
      clickIds,
      fbp: cookieFbp || null,
      fbc: cookieFbc || buildFbcFromFbclid(clickIds.fbclid),
    };
  }

  function getTrackingKey() {
    try {
      const current =
        document.currentScript ||
        document.querySelector('script[data-attribix-browser-track="1"]');
      const value = current?.getAttribute("data-tracking-key");
      return value && value.trim() ? value.trim() : null;
    } catch {
      return null;
    }
  }

  function getCheckoutIdFromUrl(url) {
    try {
      if (!url) return null;
      const u = new URL(url);
      const match = u.pathname.match(/\/checkouts\/(?:cn\/)?([^/]+)/i);
      return match?.[1] || null;
    } catch {
      return null;
    }
  }

  function getCheckoutScopedSessionId(url) {
    const checkoutId = getCheckoutIdFromUrl(url);
    if (!checkoutId) return null;
    return "chk_" + checkoutId;
  }

  async function postContext(reason) {
    const visitorId = getOrCreateVisitorId();

    const url = safeGetUrl();
    const checkoutScopedSessionId = getCheckoutScopedSessionId(url);
    const sessionId = checkoutScopedSessionId || getOrCreateSessionId();
    touchSession(sessionId);

    const referrer = safeGetReferrer();
    const host = safeGetHost();
    const trackingKey = getTrackingKey();
    const { clickIds, fbp, fbc } = getBrowserIds(url);

    const body = {
      type: "browser_context_sync",
      shop: host,
      trackingKey,
      visitorId,
      sessionId,
      eventId: "ctx_" + uuid(),
      url,
      referrer,
      host,
      clickIds,
      fbp,
      fbc,
      meta: {
        source: "attribix-browser-helper",
        reason,
        t: nowIso(),
        checkoutScopedSessionId: checkoutScopedSessionId || null,
      },
    };

    const json = JSON.stringify(body);

    try {
      if ("sendBeacon" in navigator) {
        const blob = new Blob([json], { type: "application/json" });
        const ok = navigator.sendBeacon(TRACK_URL, blob);
        if (ok) {
          console.log("[attribix browser helper] beacon ok", {
            reason,
            visitorId,
            sessionId,
            checkoutScopedSessionId: checkoutScopedSessionId || null,
            hasFbp: Boolean(fbp),
            hasFbc: Boolean(fbc),
            clickIds,
          });
          return;
        }
      }
    } catch (e) {
      console.log("[attribix browser helper] beacon error", String(e?.message || e));
    }

    try {
      const res = await fetch(TRACK_URL, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: json,
        keepalive: true,
        credentials: "omit",
      });

      console.log("[attribix browser helper] fetch", {
        status: res.status,
        reason,
        visitorId,
        sessionId,
        checkoutScopedSessionId: checkoutScopedSessionId || null,
        hasFbp: Boolean(fbp),
        hasFbc: Boolean(fbc),
        clickIds,
      });
    } catch (e) {
      console.log("[attribix browser helper] fetch error", String(e?.message || e));
    }
  }

  try {
    postContext("page_load");
  } catch (e) {
    console.log("[attribix browser helper] initial post failed", String(e?.message || e));
  }

  try {
    window.addEventListener("pageshow", () => {
      postContext("pageshow");
    });
  } catch {}

  try {
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") {
        postContext("visible");
      }
    });
  } catch {}
})();`;

export async function loader() {
  return new Response(SCRIPT, {
    status: 200,
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "public, max-age=60",
      "Access-Control-Allow-Origin": "*",
    },
  });
}