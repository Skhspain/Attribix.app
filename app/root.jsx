// app/root.jsx
import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useLoaderData,
} from "@remix-run/react";
import { json } from "@remix-run/node";

import "@shopify/polaris/build/esm/styles.css";
import "~/styles/app.css";

import { AppProvider } from "@shopify/polaris";
import enTranslations from "@shopify/polaris/locales/en.json";

import { getSettings } from "~/settings.server";

export const loader = async () => {
  const settings = await getSettings();
  return json(settings);
};

export default function Root() {
  const { pixelId, ga4Id, adsId, requireConsent } = useLoaderData();

  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        {/* Embed your app settings so the theme extension can read them */}
        <meta
          name="attribix-settings"
          content={JSON.stringify({
            pixelId,
            ga4Id,
            adsId,
            requireConsent,
          })}
        />
        <Meta />
        <Links />
      </head>
      <body>
        <AppProvider i18n={enTranslations}>
          <Outlet />
        </AppProvider>
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}