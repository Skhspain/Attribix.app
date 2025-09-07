// DO NOT redeclare `analytics` here; it's in globals.d.ts.

// Small helper to send events back to your app API.
function postEvent(path: string, payload: Record<string, any>) {
  try {
    fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, ts: Date.now() }),
      keepalive: true,
      credentials: "omit",
    }).catch(() => {});
  } catch {}
}

// --- Page view ------------------------------------------------------------
analytics.subscribe("page_viewed", (evt: any) => {
  postEvent("/api/track", {
    type: "page_viewed",
    url: evt?.context?.document?.location?.href,
    referrer: evt?.context?.document?.referrer,
    title: evt?.context?.document?.title,
  });
});

// --- Product --------------------------------------------------------------
analytics.subscribe("product_viewed", (evt: any) => {
  postEvent("/api/track", {
    type: "product_viewed",
    productId: evt?.data?.productVariant?.product?.id,
    variantId: evt?.data?.productVariant?.id,
  });
});

// --- Cart -----------------------------------------------------------------
analytics.subscribe("cart_viewed", (evt: any) => {
  postEvent("/api/track", {
    type: "cart_viewed",
    lineCount: evt?.data?.cart?.lines?.length ?? 0,
  });
});

analytics.subscribe("cart_updated", (evt: any) => {
  postEvent("/api/track", {
    type: "cart_updated",
    lineCount: evt?.data?.cart?.lines?.length ?? 0,
  });
});

// --- Checkout -------------------------------------------------------------
analytics.subscribe("checkout_started", (evt: any) => {
  postEvent("/api/track", {
    type: "checkout_started",
    checkoutToken: evt?.data?.checkout?.token,
  });
});

analytics.subscribe("purchase_completed", (evt: any) => {
  postEvent("/api/track", {
    type: "purchase_completed",
    checkoutToken: evt?.data?.checkout?.token,
    currencyCode: evt?.data?.checkout?.currencyCode,
    totalPrice: evt?.data?.checkout?.totalPrice?.amount,
  });
});
