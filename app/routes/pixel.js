// app/routes/pixel.js

import { getSettings } from "~/settings.server";

export const loader = async ({ request }) => {
  const { pixelId, ga4Id, adsId, enabled, requireConsent } = await getSettings();

  // If we require consent, block until cookie present
  if (requireConsent && !request.headers.get("cookie")?.includes("tracking_accepted=1")) {
    return new Response("", { status: 204 });
  }

  const parts = [];

  // Facebook Pixel
  if (enabled && pixelId) {
    parts.push(`
!(function(f,b,e,v,n,t,s){
  if(f.fbq)return;n=f.fbq=function(){n.callMethod?
  n.callMethod.apply(n,arguments):n.queue.push(arguments)};
  if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
  n.queue=[];t=b.createElement(e);t.async=!0;
  t.src=v;s=b.getElementsByTagName(e)[0];
  s.parentNode.insertBefore(t,s);
})(window, document, 'script',
'https://connect.facebook.net/en_US/fbevents.js');
fbq('init','${pixelId}');
fbq('track','PageView');`);
  }

  // GA4
  if (enabled && ga4Id) {
    parts.push(`
(function(i,s,o,g,r,a,m){i['GoogleAnalyticsObject']=r;i[r]=i[r]||function(){
(i[r].q=i[r].q||[]).push(arguments)},i[r].l=1*new Date();
a=s.createElement(o),m=s.getElementsByTagName(o)[0];
a.async=1;a.src=g;m.parentNode.insertBefore(a,m);
})(window,document,'script','https://www.googletagmanager.com/gtag/js?id=${ga4Id}','gtag');
gtag('js', new Date());
gtag('config','${ga4Id}');`);
  }

  // Google Ads
  if (enabled && adsId) {
    const [convId, label] = adsId.split("/");
    parts.push(`
window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${convId}');
gtag('event', 'conversion', {
  'send_to': '${adsId}'
});`);
  }

  const body = parts.join("\n");
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
};
