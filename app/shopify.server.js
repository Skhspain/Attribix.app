// app/shopify.server.js

import "@shopify/shopify-app-remix/adapters/node";
import {
  ApiVersion,
  AppDistribution,
  shopifyApp,
} from "@shopify/shopify-app-remix/server";
import { MemorySessionStorage } from "@shopify/shopify-app-session-storage-memory";

const shopify = shopifyApp({
  apiKey: process.env.SHOPIFY_API_KEY,
  apiSecretKey: process.env.SHOPIFY_API_SECRET || "",
  apiVersion: ApiVersion.January25,
  scopes: process.env.SCOPES?.split(","),

  // IMPORTANT: ensure this is an https URL in your Fly env:
  // SHOPIFY_APP_URL=https://attribix-app.fly.dev
  appUrl: process.env.SHOPIFY_APP_URL,

  authPathPrefix: "/auth",

  // FIX: make sure Shopify treats this as an embedded app (prevents http redirect issues behind proxies)
  isEmbeddedApp: true,

  sessionStorage: new MemorySessionStorage(),
  distribution: AppDistribution.AppStore,

  future: {
    unstable_newEmbeddedAuthStrategy: true,
    removeRest: true,
  },

  ...(process.env.SHOP_CUSTOM_DOMAIN
    ? { customShopDomains: [process.env.SHOP_CUSTOM_DOMAIN] }
    : {}),
});

export default shopify;

export const apiVersion = ApiVersion.January25;
export const addDocumentResponseHeaders = shopify.addDocumentResponseHeaders;
export const authenticate = shopify.authenticate;
export const unauthenticated = shopify.unauthenticated;
export const login = shopify.login;
export const registerWebhooks = shopify.registerWebhooks;
export const sessionStorage = shopify.sessionStorage;
