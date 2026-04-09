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

  const js = `
// Attribix Meta Pixel Loader
!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,
document,'script','https://connect.facebook.net/en_US/fbevents.js');
fbq('init', '${pixelId}');
fbq('track', 'PageView');
`;

  return new Response(js, {
    headers: {
      "Content-Type": "application/javascript",
      "Cache-Control": "public, max-age=300",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
