import { register } from "@shopify/web-pixels-extension";

/**
 * Minimal Attribix pixel
 * - Uses the current register(api) signature (no id string)
 * - Pulls accountID from extension settings
 * - Sends Shopify pixel events to your Remix endpoint
 * - Uses navigator.sendBeacon when available, fetch() otherwise
 */

type Settings = {
  accountID?: string;
};

export default register(({ analytics, settings }) => {
  const { accountID } = (settings as Settings) ?? {};

  function post(type: string, ev: any) {
    // SDK event objects expose the payload at ev.data
    const payload = ev?.data ?? ev ?? null;

    const body = JSON.stringify({
      type,
      accountID,
      event: payload,
    });

    const url = "https://attribix-app.fly.dev/api/track";

    // Try sendBeacon first (non-blocking even on unload)
    try {
      if ("sendBeacon" in navigator) {
        const blob = new Blob([body], { type: "application/json" });
        (navigator as any).sendBeacon(url, blob);
        return;
      }
    } catch {
      // fall through to fetch
    }

    // Fallback to fetch; keepalive lets it run during page unload
    fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => {
      /* swallow network errors in pixel */
    });
  }

  // Subscribe to a few common events (you can add more as needed)
  analytics.subscribe("page_viewed",       (e) => post("page_viewed", e));
  analytics.subscribe("product_viewed",    (e) => post("product_viewed", e));
  analytics.subscribe("collection_viewed", (e) => post("collection_viewed", e));
  analytics.subscribe("search_submitted",  (e) => post("search_submitted", e));
  analytics.subscribe("checkout_started",  (e) => post("checkout_started", e));
});
