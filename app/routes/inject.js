// app/routes/inject.js
export const loader = async ({ request }) => {
  const url = new URL(request.url);
  const ORIGIN =
    process.env.APP_URL?.replace(/\/$/, "") || `${url.protocol}//${url.host}`;

  const GA4_ID = process.env.GA4_MEASUREMENT_ID || "";
  const ADS_ID = process.env.GOOGLE_ADS_CONVERSION_ID || "";
  const FB_ID = process.env.META_PIXEL_ID || "";

  const js = `
  (function(){
    // --- Consent Mode v2 defaults (tune with your CMP if needed) ---
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    gtag('consent', 'default', {
      ad_user_data: 'granted',
      ad_personalization: 'granted',
      ad_storage: 'granted',
      analytics_storage: 'granted',
      functionality_storage: 'granted',
      personalization_storage: 'granted',
      security_storage: 'granted',
      wait_for_update: 500
    });

    // --- gtag (GA4 + Ads) ---
    (function(i,d,s,u){
      var t=d.createElement(s); t.async=1; t.src=u; d.head.appendChild(t);
    })(window,document,'script','https://www.googletagmanager.com/gtag/js?id=${GA4_ID}');
    gtag('js', new Date());
    if ('${GA4_ID}') gtag('config', '${GA4_ID}', { send_page_view: true });
    if ('${ADS_ID}') gtag('config', '${ADS_ID}');

    // --- Meta Pixel ---
    (function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
      n.callMethod.apply(n,arguments):n.queue.push(arguments)};
      if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
      n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;
      s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)
    })(window, document,'script','https://connect.facebook.net/en_US/fbevents.js');
    if ('${FB_ID}') { fbq('init', '${FB_ID}'); fbq('track', 'PageView'); }

    // --- Utility: UUID v4 ---
    function uuidv4(){
      return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = Math.random()*16|0, v = c == 'x' ? r : (r&0x3|0x8);
        return v.toString(16);
      });
    }

    // --- Persist attribution params (90 days) ---
    (function(){
      const p = new URLSearchParams(location.search);
      const setCookie = (k,v) => document.cookie = k + '=' + encodeURIComponent(v) + ';path=/;max-age=7776000';
      ['gclid','gbraid','wbraid'].forEach(k => { if(p.get(k)) setCookie(k, p.get(k)); });
    })();

    // --- Collect client identifiers for server matching ---
    function collectIds(){
      const raw = (document.cookie || '').split(/;\\s*/).filter(Boolean);
      const cookies = Object.fromEntries(raw.map(c=>{
        const i=c.indexOf('='); return [c.slice(0,i), decodeURIComponent(c.slice(i+1))];
      }));
      return {
        fbp: cookies._fbp || null,
        fbc: cookies._fbc || null,
        gclid: cookies.gclid || null,
        gbraid: cookies.gbraid || null,
        wbraid: cookies.wbraid || null,
        client_user_agent: navigator.userAgent,
        client_language: navigator.language
      };
    }

    // --- Public API: fire a Purchase and mirror server-side ---
    window.attribixPurchase = function(payload){
      // Browser hits
      if ('${GA4_ID}') gtag('event', 'purchase', {
        value: Number(payload.value || 0),
        currency: payload.currency || 'USD',
        transaction_id: payload.order_id
      });
      if ('${FB_ID}') fbq('track', 'Purchase', {
        value: Number(payload.value || 0),
        currency: payload.currency || 'USD'
      });

      // Server mirror
      const event_id = uuidv4();
      const ids = collectIds();
      try {
        fetch('${ORIGIN}/api/track', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          keepalive: true,
          body: JSON.stringify({
            type: 'purchase',
            event_id,
            value: payload.value,
            currency: payload.currency,
            order_id: payload.order_id,
            email: payload.email || null,
            ...ids
          })
        });
      } catch (e) {}
    };
  })();`;

  return new Response(js, {
    status: 200,
    headers: {
      "content-type": "application/javascript; charset=utf-8",
      "cache-control": "no-store, must-revalidate",
    },
  });
};
