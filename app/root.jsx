// app/root.jsx
import React from "react";
import { json } from "@remix-run/node";
import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useLoaderData,
} from "@remix-run/react";
import polarisStyles from "@shopify/polaris/build/esm/styles.css?url";
import appStyles from "~/styles/fix-clicks.css?url";

import AppBridgeProvider from "~/components/AppBridgeProvider";

export const links = () => [
  { rel: "stylesheet", href: polarisStyles },
  { rel: "stylesheet", href: appStyles },
];

// Minimal: expose API key to the browser for App Bridge Provider
export async function loader() {
  return json({
    ENV: {
      SHOPIFY_API_KEY: process.env.SHOPIFY_API_KEY || "",
    },
  });
}

/**
 * Avoid revalidating the root loader for in-place settings mutations.
 * The settings route already returns fresh JSON via fetcher, so reloading root
 * adds unnecessary client-side churn and can look like the page is hanging.
 */
export function shouldRevalidate({
  formAction,
  formMethod,
  actionResult,
  defaultShouldRevalidate,
}) {
  const normalizedMethod =
    typeof formMethod === "string" ? formMethod.toUpperCase() : "";

  const isSettingsPost =
    normalizedMethod === "POST" &&
    typeof formAction === "string" &&
    formAction.includes("/app/settings");

  if (isSettingsPost && actionResult?.ok) {
    return false;
  }

  return defaultShouldRevalidate;
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
        <AppBridgeProvider apiKey={data?.ENV?.SHOPIFY_API_KEY}>
          <Outlet />
        </AppBridgeProvider>

        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}