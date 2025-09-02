import "@shopify/shopify-app-remix/server/adapters/node";
import { shopifyApp } from "@shopify/shopify-app-remix/server";
import { restResources } from "@shopify/shopify-api/rest/admin/2024-07";
import { DeliveryMethod } from "@shopify/shopify-api";
import { MemorySessionStorage } from "@shopify/shopify-app-session-storage-memory";
import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";
import db from "./utils/db.server";

// Use in-memory sessions for dev by default; Prisma in production
const useMemory =
  process.env.USE_MEMORY_SESSION === "1" || process.env.NODE_ENV !== "production";

const sessionStorage = useMemory
  ? new MemorySessionStorage()
  : new PrismaSessionStorage(db);

export const shopify = shopifyApp({
  apiKey: process.env.SHOPIFY_API_KEY!,
  apiSecretKey: process.env.SHOPIFY_API_SECRET!,
  appUrl: process.env.SHOPIFY_APP_URL!,
  isEmbeddedApp: true,
  authPathPrefix: "/auth",
  sessionStorage,
  restResources,

  // ✅ Declare handlers here; framework registers them after OAuth
  webhooks: {
    APP_UNINSTALLED: {
      deliveryMethod: DeliveryMethod.Http,
      callbackUrl: "/webhooks/app.uninstalled",
    },
    CUSTOMERS_CREATE: {
      deliveryMethod: DeliveryMethod.Http,
      callbackUrl: "/webhooks/customers_create",
    },
    ORDERS_CREATE: {
      deliveryMethod: DeliveryMethod.Http,
      callbackUrl: "/webhooks/orders_create",
    },
  },
});

export const { authenticate } = shopify;
