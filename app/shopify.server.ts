import { shopifyApp } from "@shopify/shopify-app-remix/server";
import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";
import { restResources } from "@shopify/shopify-api/rest/admin/2024-07";
import prisma from "~/utils/db.server";

const { SHOPIFY_API_KEY, SHOPIFY_API_SECRET, SHOPIFY_APP_URL, SCOPES } = process.env;

if (!SHOPIFY_API_KEY || !SHOPIFY_API_SECRET || !SHOPIFY_APP_URL) {
  throw new Error("Missing one of SHOPIFY_API_KEY/SHOPIFY_API_SECRET/SHOPIFY_APP_URL");
}

export const shopify = shopifyApp({
  apiKey: SHOPIFY_API_KEY,
  apiSecretKey: SHOPIFY_API_SECRET,
  appUrl: SHOPIFY_APP_URL,
  isEmbeddedApp: true,
  scopes: (SCOPES ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
  sessionStorage: new PrismaSessionStorage(prisma),
  api: {
    restResources, // MUST be nested under `api`
  },
});
