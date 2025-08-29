import { shopifyApp } from "@shopify/shopify-app-remix/server";
import { restResources } from "@shopify/shopify-api/rest/admin/2024-07";
import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";
import prisma from "~/utils/prisma.server";

const sessionStorage = new PrismaSessionStorage(prisma);

const shopify = shopifyApp({
  apiKey: process.env.SHOPIFY_API_KEY!,
  apiSecretKey: process.env.SHOPIFY_API_SECRET!,
  appUrl: process.env.SHOPIFY_APP_URL!,
  scopes: (process.env.SCOPES ?? "write_products,read_orders").split(","),
  isEmbeddedApp: true,
  sessionStorage,
  // NOTE: top-level, not under `api`
  restResources,
});

export default shopify;
export const authenticate = shopify.authenticate;
