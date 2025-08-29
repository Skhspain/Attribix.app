// app/shopify.server.js
import "dotenv/config";
import "@shopify/shopify-app-remix/adapters/node";
import {
  ApiVersion,
  AppDistribution,
  shopifyApp,
} from "@shopify/shopify-app-remix/server";
import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";
import prisma from "~/utils/db.server";

// We can import a TS module in Remix; it’s compiled by the build.
import { getBaseUrl } from "~/utils/url.server";

import fs from "fs";
import path from "path";

/** Resolve a valid appUrl: prefer env, else read from shopify.app.toml */
function resolveAppUrl() {
  if (process.env.SHOPIFY_APP_URL) return process.env.SHOPIFY_APP_URL;

  try {
    const tomlPath = path.resolve(process.cwd(), "shopify.app.toml");
    const raw = fs.readFileSync(tomlPath, "utf8");
    const m = raw.match(/application_url\s*=\s*"([^"]+)"/);
    if (m && m[1]) return m[1];
  } catch {
    // ignore
  }
  return undefined;
}

const appUrl = resolveAppUrl();

if (!appUrl) {
  throw new Error(
    "Attribix: appUrl is undefined. Set SHOPIFY_APP_URL in .env OR ensure shopify.app.toml contains application_url."
  );
}

// Scopes from .env
const scopes = (process.env.SCOPES || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

if (process.env.NODE_ENV !== "production") {
  console.log("[Attribix] appUrl:", appUrl);
  console.log("[Attribix] Effective SCOPES:", scopes.join(","));
}

/** Helper: register (upsert) a webhook for this shop */
async function upsertWebhook(admin, session, topic, address) {
  try {
    await admin.rest.resources.Webhook.create({
      session,
      webhook: { topic, address, format: "json" },
    });
  } catch (err) {
    // Shopify may 422 on duplicates; safe to ignore.
    if (process.env.NODE_ENV !== "production") {
      console.log(`[webhook upsert] topic=${topic} addr=${address}`, err?.message);
    }
  }
}

const shopify = shopifyApp({
  apiKey: process.env.SHOPIFY_API_KEY || "",
  apiSecretKey: process.env.SHOPIFY_API_SECRET || "",
  apiVersion: ApiVersion.January25,
  appUrl, // required by SDK
  scopes,
  authPathPrefix: "/auth",
  sessionStorage: new PrismaSessionStorage(prisma),
  distribution: AppDistribution.AppStore,
  future: {
    unstable_newEmbeddedAuthStrategy: true,
    removeRest: false,
  },
  hooks: {
    // Runs on install and on re-auth for each shop → auto-register webhooks to current base URL.
    afterAuth: async (ctx) => {
      const { admin, request, session } = ctx;
      const base = getBaseUrl(request);

      await Promise.all([
        upsertWebhook(admin, session, "orders/create", `${base}/webhooks/orders_create`),
        upsertWebhook(admin, session, "customers/create", `${base}/webhooks/customers_create`),

        // GDPR (no-op handlers are fine)
        upsertWebhook(admin, session, "customers/redact", `${base}/webhooks/gdpr/customers_redact`),
        upsertWebhook(admin, session, "shop/redact", `${base}/webhooks/gdpr/shop_redact`),
        upsertWebhook(admin, session, "customers/data_request", `${base}/webhooks/gdpr/customers_data_request`),
      ]);

      if (process.env.NODE_ENV !== "production") {
        console.log(`[afterAuth] Webhooks registered for ${session.shop} at ${base}`);
      }
    },
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
