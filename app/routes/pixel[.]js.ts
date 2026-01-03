import type { LoaderFunctionArgs } from "@remix-run/node";

/**
 * Public endpoint that serves your storefront pixel script.
 * Route: GET /pixel.js
 *
 * IMPORTANT:
 * - Must be reachable without Shopify admin auth (no embedded params required)
 * - Shopify App Proxy points to this URL (https://attribix-app.fly.dev/pixel.js)
 */
export async function loader({ request }: LoaderFunctionArgs) {
  const js = `/* Attribix pixel (served from /pixel.js) */
(function () {
  try {
    window.Attribix = window.Attribix || {};
    window.Attribix.loadedAt = Date.now();

    function send(eventName, extra) {
      try {
        var payload = {
          event: eventName,
          ts: Date.now(),
          url: String(location.href || ""),
          referrer: String(document.referrer || ""),
          ua: String(navigator.userAgent || ""),
          ...extra
        };

        // IMPORTANT:
        // Use SAME-ORIGIN endpoint via App Proxy (avoids CORS/cookie issues)
        fetch("/apps/pixel/track", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
          keepalive: true
        }).catch(function(){});
      } catch (e) {}
    }

    // Page view
    send("page_view", {});

    // Example click hook
    document.addEventListener("click", function (e) {
      try {
        var el = e && e.target;
        if (!el) return;
        var tag = el.tagName ? String(el.tagName).toLowerCase() : "";
        send("click", { tag: tag });
      } catch (err) {}
    }, { passive: true });

  } catch (e) {
    console.warn("[Attribix pixel] failed", e);
  }
})();`;

  return new Response(js, {
    status: 200,
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "public, max-age=60",
    },
  });
}
