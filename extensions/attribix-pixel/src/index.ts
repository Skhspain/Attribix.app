// extensions/attribix-pixel/src/index.ts
import { register } from "@shopify/web-pixels-extension";

/**
 * Attribix Web Pixel (instrumented)
 *
 * What this file does:
 * 1) Logs "pixel_boot" (so we can prove the pixel actually runs)
 * 2) Sends a small "pixel_boot" event to /api/track (so we can prove outbound network works)
 * 3) Subscribes to common analytics events and forwards them to /api/track
 *
 * Why this helps:
 * - Right now /api/track works (your manual POST returns 204 and logs show it)
 * - But we see ZERO /api/track calls from the storefront => either:
 *   (A) pixel never runs, OR (B) pixel runs but outbound request is blocked.
 * - This file will let us distinguish A vs B quickly.
 */

type Settings = {
  accountID?: string;
};

type TrackBody = {
  type: string;
  accountID?: string;
  event?: any;
  meta?: Record<string, any>;
};

const TRACK_URL = "https://attribix-app.fly.dev/api/track";

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

export default register(({ analytics, settings }) => {
  // IMPORTANT:
  // Shopify sends "settings" as an object matching your extension settings schema.
  // If your settings field is called "accountID" in shopify.extension.toml, it will show up here.
  const { accountID } = (settings as Settings) ?? {};

  // NOTE:
  // In Shopify Web Pixels, console logs do NOT always show in the normal page console.
  // You must switch DevTools context to the "web-pixel-sandbox-..." frame/worker to see them.
  console.log("[attribix pixel] boot", {
    hasSettings: !!settings,
    settings,
    accountID,
    t: nowIso(),
  });

  async function post(type: string, ev?: any, meta?: Record<string, any>) {
    const payload = ev?.data ?? ev ?? null;

    const body: TrackBody = {
      type,
      accountID,
      event: payload,
      meta: {
        ...meta,
        t: nowIso(),
        hasAccountID: Boolean(accountID),
      },
    };

    const jsonBody = safeJson(body);

    // Try sendBeacon first (good for unload / non-blocking)
    try {
      if ("sendBeacon" in navigator) {
        const blob = new Blob([jsonBody], { type: "application/json" });
        const ok = (navigator as any).sendBeacon(TRACK_URL, blob);
        console.log("[attribix pixel] sendBeacon", { type, ok });
        return;
      }
    } catch (e) {
      console.log("[attribix pixel] sendBeacon error", String((e as any)?.message || e));
      // fall through to fetch
    }

    // Fallback fetch
    try {
      const res = await fetch(TRACK_URL, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: jsonBody,
        keepalive: true,
      });

      console.log("[attribix pixel] fetch", { type, status: res.status });
    } catch (e) {
      console.log("[attribix pixel] fetch error", {
        type,
        err: String((e as any)?.message || e),
      });
    }
  }

  // 1) Immediate boot ping (this is the key “is the pixel running at all?” signal)
  // If you do NOT see this in fly logs, the pixel never executed.
  void post("pixel_boot", null, { reason: "pixel_loaded" });

  // 2) Basic event forwarding
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
});
