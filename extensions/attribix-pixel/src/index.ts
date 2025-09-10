import {register} from '@shopify/web-pixels-extension';

const ENDPOINT = 'https://attribix-app.fly.dev/api/track';

function send(payload: unknown) {
  try {
    if (typeof navigator !== 'undefined' && 'sendBeacon' in navigator) {
      const blob = new Blob([JSON.stringify(payload)], {type: 'application/json'});
      navigator.sendBeacon(ENDPOINT, blob);
      return;
    }
  } catch {}

  try {
    fetch(ENDPOINT, {
      method: 'POST',
      headers: {'content-type': 'application/json'},
      body: JSON.stringify(payload),
      keepalive: true,
    }).catch(() => {});
  } catch {}
}

register(({analytics}) => {
  analytics.subscribe('page_viewed', (event) => send({type: 'page_viewed', event}));
  analytics.subscribe('product_viewed', (event) => send({type: 'product_viewed', event}));
  analytics.subscribe('search_submitted', (event) => send({type: 'search_submitted', event}));
  analytics.subscribe('product_added_to_cart', (event) => send({type: 'product_added_to_cart', event}));
  analytics.subscribe('checkout_started', (event) => send({type: 'checkout_started', event}));
  analytics.subscribe('checkout_completed', (event) => send({type: 'checkout_completed', event}));
});
