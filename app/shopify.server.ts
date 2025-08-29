import { shopifyApp } from "@shopify/shopify-app-remix";
import { PrismaClient } from "@prisma/client";
import { restResources } from "@shopify/shopify-api/rest/admin/2024-07";

// If you later store sessions in Prisma, you can wire the prisma storage package here.
// For now we keep it simple.
const prisma = new PrismaClient();

// Environment: make sure these are set (.env locally, Fly secrets in prod)
const {
  SHOPIFY_API_KEY,
  SHOPIFY_API_SECRET,
  SHOPIFY_APP_URL,
  SCOPES
} = process.env;

if (!SHOPIFY_API_KEY || !SHOPIFY_API_SECRET || !SHOPIFY_APP_URL) {
  // Fail fast in dev; in prod you might want to log and 500
  console.warn("Missing required Shopify env vars: SHOPIFY_API_KEY/SECRET/APP_URL");
}

const sessionStorage = undefined; // using default in-memory for now

const shopify = shopifyApp({
  apiKey: SHOPIFY_API_KEY!,
  apiSecretKey: SHOPIFY_API_SECRET!,
  appUrl: SHOPIFY_APP_URL!,
  scopes: (SCOPES ?? "write_products,read_orders").split(","),
  isEmbeddedApp: true,
  sessionStorage,
  // top-level restResources (do NOT put under `api`)
  restResources,
});

export default shopify;

// Routes import this:
export const authenticate = shopify.authenticate;
