// app/root.jsx
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

// ✅ Global Polaris styles – imported for side effects only.
//    (No default import, so Rollup/Vite won't complain.)
import "@shopify/polaris/build/esm/styles.css";

// Root loader just exposes the API key for the embedded app.
export async function loader() {
  return json({
    apiKey: process.env.SHOPIFY_API_KEY,
  });
}

export default function App() {
  const { apiKey } = useLoaderData();

  return (
    <html lang="en">
      <head>
        <Meta />
        <Links />
      </head>
      <body>
        <AppProvider apiKey={apiKey} isEmbeddedApp>
          <Outlet />
        </AppProvider>

        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}
