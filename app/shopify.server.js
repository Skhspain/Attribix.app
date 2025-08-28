import "dotenv/config";
import "@shopify/shopify-app-remix/adapters/node";
import {
  ApiVersion,
  AppDistribution,
  shopifyApp,
} from "@shopify/shopify-app-remix/server";
import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";
import prisma from "./db.server";

import fs from "fs";
import path from "path";

/** Resolve appUrl: prefer .env, else read from shopify.app.toml */
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

// Parse scopes
const scopes = (process.env.SCOPES || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

console.log("[Attribix] appUrl:", appUrl);
console.log("[Attribix] Effective SCOPES:", scopes.join(","));

const shopify = shopifyApp({
  apiKey: process.env.SHOPIFY_API_KEY || "",
  apiSecretKey: process.env.SHOPIFY_API_SECRET || "",
  apiVersion: ApiVersion.January25,
  appUrl,
  scopes,
  authPathPrefix: "/auth",
  sessionStorage: new PrismaSessionStorage(prisma),
  distribution: AppDistribution.AppStore,
  future: {
    unstable_newEmbeddedAuthStrategy: true,
    removeRest: false,
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
