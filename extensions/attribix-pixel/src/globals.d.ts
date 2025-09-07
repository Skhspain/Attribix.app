// Minimal ambient typings for Shopify's storefront analytics runtime.
// Shopify exposes a global `analytics` object to pixels on the storefront.

type AttribixEventHandler<T = any> = (evt: T) => void;

interface ShopifyAnalyticsGlobal {
  subscribe: (eventName: string, handler: AttribixEventHandler) => void;
}

declare const analytics: ShopifyAnalyticsGlobal;

// If you also use a dataLayer for GTM-style fanout, this keeps TS happy:
declare global {
  interface Window {
    dataLayer?: any[];
  }
}
