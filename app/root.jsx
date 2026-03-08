// app/root.jsx
import React from "react";
import { json } from "@remix-run/node";
import { Links, Meta, Outlet, Scripts, ScrollRestoration, useLoaderData } from "@remix-run/react";
import { AppProvider } from "@shopify/shopify-app-remix/react";
import polarisStyles from "@shopify/polaris/build/esm/styles.css?url";

import AppBridgeProvider from "~/components/AppBridgeProvider";

export const links = () => [{ rel: "stylesheet", href: polarisStyles }];

// Minimal: expose API key to the browser for App Bridge Provider
export async function loader() {
  return json({
    ENV: {
      SHOPIFY_API_KEY: process.env.SHOPIFY_API_KEY || "",
    },
  });
}

export default function App() {
  const data = useLoaderData();

  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body>
        <AppProvider>
          <AppBridgeProvider apiKey={data?.ENV?.SHOPIFY_API_KEY}>
            <Outlet />
          </AppBridgeProvider>
        </AppProvider>

        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}
