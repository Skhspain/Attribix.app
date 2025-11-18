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

// Root loader just exposes the API key for the embedded app.
export async function loader() {
  return json({
    apiKey: process.env.SHOPIFY_API_KEY,
  });
}

export default function App() {
  const { apiKey } = useLoaderData();

  return (
    <html>
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
