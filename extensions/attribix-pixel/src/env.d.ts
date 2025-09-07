/// <reference types="@shopify/web-pixels-extension-types" />

// If you reference any custom globals in your pixel, declare them here.
declare global {
  // eslint-disable-next-line no-var
  var SHOP_APP_URL: string | undefined;
}

export {};
