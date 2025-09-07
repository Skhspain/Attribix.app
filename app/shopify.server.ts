// app/shopify.server.ts
import { shopifyApp } from "@shopify/shopify-app-remix/server";
import { ApiVersion } from "@shopify/shopify-api";
import { restResources } from "@shopify/shopify-api/rest/admin/2024-07";
import { MemorySessionStorage } from "@shopify/shopify-app-session-storage-memory";

const sessionStorage = new MemorySessionStorage();

const shopify = shopifyApp({
  apiKey: process.env.SHOPIFY_API_KEY!,
  apiSecretKey: process.env.SHOPIFY_API_SECRET!,
  apiVersion: ApiVersion.July24, // matches 2024-07
  scopes: (process.env.SCOPES ?? "").split(",").filter(Boolean),
  appUrl: process.env.APP_URL!,
  authPathPrefix: "/auth",
  sessionStorage,
  restResources,
});

export default shopify;
