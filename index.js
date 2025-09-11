import { register } from '@shopify/web-pixels-extension';

const ENDPOINT = 'https://attribix-app.fly.dev/api/track';

type PixelSettings = {
  accountID?: string;
};

register(({ analytics, browser, settings }) => {
  const accountID = (settings as PixelSettings)?.accountID;

  const send = (type: string, data: any) => {
    const body = { type, accountID, timestamp: Date.now(), data };
    const json = JSON.stringify(body);

    // Shopify pixel runtime: string payload for sendBeacon
    try {
      if (browser && typeof (browser as any).sendBeacon === 'function') {
        (browser as any).sendBeacon(ENDPOINT, json);
        return;
      }
    } catch { /* ignore */ }

    // Fallbacks for safety
    try {
      if (typeof navigator !== 'undefined' && 'sendBeacon' in navigator) {
        (navigator as any).sendBeacon(
          ENDPOINT,
          new Blob([json], { type: 'application/json' })
        );
      } else {
        // Best-effort fetch
        fetch(ENDPOINT, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: json,
          keepalive: true,
          mode: 'cors',
          credentials: 'omit',
        }).catch(() => {});
      }
    } catch { /* ignore */ }
  };

  // Subscribe to events you care about
  analytics.subscribe('page_viewed',              (e) => send('page_viewed', e));
  analytics.subscribe('product_viewed',           (e) => send('product_viewed', e));
  analytics.subscribe('search_submitted',         (e) => send('search_submitted', e));
  analytics.subscribe('product_added_to_cart',    (e) => send('product_added_to_cart', e));
  analytics.subscribe('checkout_started',         (e) => send('checkout_started', e));
  analytics.subscribe('checkout_completed',       (e) => send('checkout_completed', e));
});
