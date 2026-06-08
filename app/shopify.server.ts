import prisma from "~/db.server";
import { AppDistribution, shopifyApp } from "@shopify/shopify-app-remix/server";
import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";
import { DeliveryMethod } from "@shopify/shopify-api";

// Hard fallback so you never accidentally generate Cloudflare URLs again
const FALLBACK_APP_URL = "https://attribix-app.fly.dev";
const APP_URL = (process.env.SHOPIFY_APP_URL || FALLBACK_APP_URL).replace(/\/$/, "");

const shopify = shopifyApp({
  apiKey: process.env.SHOPIFY_API_KEY!,
  apiSecretKey: process.env.SHOPIFY_API_SECRET!,
  appUrl: APP_URL,
  scopes: (process.env.SCOPES ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
  distribution: AppDistribution.AppStore,
  sessionStorage: new PrismaSessionStorage(prisma),
  webhooks: {
    // Non-compliance webhooks registered via shopifyApp. GDPR/privacy
    // compliance webhooks live ONLY in shopify.app.toml under
    // [webhooks.privacy_compliance] — registering them in both places
    // causes duplicate deliveries per Shopify guidance.
    APP_UNINSTALLED: {
      deliveryMethod: DeliveryMethod.Http,
      callbackUrl: "/webhooks/app/uninstalled",
    },
    ORDERS_CREATE: {
      deliveryMethod: DeliveryMethod.Http,
      callbackUrl: "/webhooks/orders_create",
    },
  },
  future: {},
});

export default shopify;
export const authenticate = shopify.authenticate;
