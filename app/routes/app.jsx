// app/routes/app.jsx
import { json } from "@remix-run/node";
import { Outlet, useLoaderData } from "@remix-run/react";
import { AppProvider } from "@shopify/shopify-app-remix/react";
import enTranslations from "@shopify/polaris/locales/en.json";
import React from "react";

// ❌ remove this (server-only at module scope):
// import shopify from "~/shopify.server";

export async function loader({ request }) {
  // ✅ Import server-only code at runtime, on the server
  //    Use a RELATIVE path and a `.js` extension.
  const mod = await import("../shopify.server.js");
  const shopify = mod.default ?? mod.shopify;

  // If you require an authenticated admin session on this route, keep this:
  if (shopify?.authenticate?.admin) {
    await shopify.authenticate.admin(request);
  }

  // Provide API key to the client UI. Prefer env first, fall back to shopify config if present.
  const apiKey =
    process.env.SHOPIFY_API_KEY ??
    shopify?.api?.config?.apiKey ??
    "";

  return json({ apiKey });
}

export default function AppLayout() {
  const { apiKey } = useLoaderData();

  return (
    <AppProvider isEmbeddedApp apiKey={apiKey} i18n={enTranslations}>
      <Outlet />
    </AppProvider>
  );
}
