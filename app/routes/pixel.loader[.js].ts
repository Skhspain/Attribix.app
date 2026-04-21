// app/routes/pixel.loader[.js].ts
// Serves a dynamic JS file that injects the Meta Pixel on the storefront.
// Loaded via ScriptTag alongside the review widget.
import type { LoaderFunctionArgs } from "@remix-run/node";
import { db } from "~/db.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop") || "";

  if (!shop) {
    return new Response("// no shop", { headers: { "Content-Type": "application/javascript", "Cache-Control": "public, max-age=300" } });
  }

  const settings = await db.trackingSettings.findUnique({ where: { shop } }).catch(() => null);
  const pixelId = settings?.fbPixelId || "";

  if (!pixelId) {
    return new Response("// no pixel configured", { headers: { "Content-Type": "application/javascript", "Cache-Control": "public, max-age=300" } });
  }

  // Meta Pixel is only loaded after the visitor has granted analytics + marketing
  // consent via Shopify's Customer Privacy API. This is required for GDPR/CCPA
  // compliance — firing pixels without consent is grounds for App Store rejection.
  const js = `
// Attribix Meta Pixel Loader (consent-gated)
(function(){
  var PIXEL_ID = ${JSON.stringify(pixelId)};
  var loaded = false;

  function loadPixel(){
    if (loaded) return;
    loaded = true;
    !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
    n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
    n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
    t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s);}(window,
    document,'script','https://connect.facebook.net/en_US/fbevents.js');
    fbq('init', PIXEL_ID);
    fbq('track', 'PageView');
  }

  function consentGranted(){
    try {
      var cp = window.Shopify && window.Shopify.customerPrivacy;
      if (!cp) return null; // API not yet available
      return !!(cp.analyticsProcessingAllowed && cp.analyticsProcessingAllowed()) &&
             !!(cp.marketingAllowed && cp.marketingAllowed());
    } catch(_) { return false; }
  }

  var state = consentGranted();
  if (state === true) { loadPixel(); return; }

  // Wait for consent signal. In regions without a consent banner, Shopify's
  // Customer Privacy API returns true immediately on these listeners too.
  document.addEventListener('visitorConsentCollected', function(e){
    try {
      var d = (e && e.detail) || {};
      if (d.analyticsAllowed && d.marketingAllowed) loadPixel();
    } catch(_){}
  });

  // Late-init: some themes load Customer Privacy after this script.
  var tries = 0;
  var poll = setInterval(function(){
    tries++;
    var s = consentGranted();
    if (s === true) { clearInterval(poll); loadPixel(); return; }
    if (tries > 20) clearInterval(poll); // stop after ~10s
  }, 500);
})();
`;

  return new Response(js, {
    headers: {
      "Content-Type": "application/javascript",
      "Cache-Control": "public, max-age=300",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
