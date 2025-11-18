// app/routes/app.jsx
import { json } from "@remix-run/node";
import { useLoaderData, Link, Outlet } from "@remix-run/react";

import { boundary } from "@shopify/shopify-app-remix/server";
import { AppProvider } from "@shopify/shopify-app-remix/react";
import { NavMenu } from "@shopify/app-bridge-react";

import polarisStyles from "@shopify/polaris/build/esm/styles.css?url";
import { authenticate } from "../shopify.server";

// NOTE: this file lives in app/routes/, so go up one level to components
import Tracking from "../components/Tracking";

export const links = () => [{ rel: "stylesheet", href: polarisStyles }];

export const loader = async ({ request }) => {
  await authenticate.admin(request);
  return json({ apiKey: process.env.SHOPIFY_API_KEY ?? "" });
};

export const ErrorBoundary = boundary;

export default function App() {
  const { apiKey } = useLoaderData();

  return (
    <AppProvider isEmbeddedApp apiKey={apiKey}>
      <NavMenu>
        <Link to="/app" rel="home">Home</Link>
        <Link to="/app/additional">Additional page</Link>
        <Link to="/app/tracked-items">Tracked Items</Link>
        <Link to="/app/stats">Stats</Link>
      </NavMenu>

      {/* fire page-view tracking whenever this route renders */}
      <Tracking />

      <Outlet />
    </AppProvider>
  );
}
