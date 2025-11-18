// app/routes/app.jsx
import { json } from "@remix-run/node";
import { useLoaderData, Outlet } from "@remix-run/react";

import enTranslations from "@shopify/polaris/locales/en.json";
import { AppProvider as PolarisAppProvider } from "@shopify/polaris";

import {
  AppProvider as ShopifyAppProvider,
} from "@shopify/shopify-app-remix/react";

import shopify from "~/shopify.server";

export const loader = async ({ request }) => {
  const { session } = await shopify.authenticate.admin(request);

  const url = new URL(request.url);
  const host = url.searchParams.get("host");

  if (!host) {
    throw new Response("Missing host parameter", { status: 400 });
  }

  return json({
    apiKey: process.env.SHOPIFY_API_KEY,
    host,
    shop: session.shop,
  });
};

export default function App() {
  const { apiKey, host } = useLoaderData();

  return (
    <ShopifyAppProvider
      apiKey={apiKey}
      host={host}
      isEmbeddedApp={true}
    >
      <PolarisAppProvider i18n={enTranslations}>
        <Outlet />
      </PolarisAppProvider>
    </ShopifyAppProvider>
  );
}
