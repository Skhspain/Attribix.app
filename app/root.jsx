import { json } from "@remix-run/node";
import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useLoaderData,
} from "@remix-run/react";
import { AppProvider } from "@shopify/shopify-app-remix/react";
import polarisStyles from "@shopify/polaris/build/esm/styles.css?url";

export const links = () => [{ rel: "stylesheet", href: polarisStyles }];

export async function loader() {
  return json({
    ENV: {
      // ✅ runtime-safe: comes from Fly secrets at request time (not build time)
      SHOPIFY_API_KEY: process.env.SHOPIFY_API_KEY,
      SHOPIFY_APP_URL: process.env.SHOPIFY_APP_URL,
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
          <Outlet />
        </AppProvider>

        {/* ✅ runtime ENV for the browser (so App Bridge can read API key safely) */}
        <script
          dangerouslySetInnerHTML={{
            __html: `window.ENV = ${JSON.stringify(data?.ENV ?? {})};`,
          }}
        />

        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}
