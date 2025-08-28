// File: app/routes/ga.js

import { getSettings } from "~/settings.server";

export const loader = async () => {
  const { gaId, adsId } = await getSettings();
  if (!gaId && !adsId) {
    return new Response("", { status: 204 });
  }

  const consentSnippet = `
    window.dataLayer = window.dataLayer || [];
    function gtag(){ dataLayer.push(arguments); }
    gtag('consent','default', {
      'analytics_storage': 'denied',
      'ad_storage': 'denied'
    });
    var s = document.createElement('script');
    s.async = true;
    s.src = 'https://www.googletagmanager.com/gtag/js?id=${gaId}';
    document.head.appendChild(s);
    gtag('js', new Date());
    gtag('config', '${gaId}', { send_page_view: true });
    ${adsId ? `gtag('config', '${adsId}');` : ''}
  `;

  return new Response(consentSnippet, {
    headers: {
      "Content-Type": "application/javascript",
      "Cache-Control": "public, max-age=3600",
    },
  });
};