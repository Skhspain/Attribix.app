// app/routes/app.jsx
import { boundary } from "@shopify/shopify-app-remix/server";
import { AppProvider } from "@shopify/shopify-app-remix/react";
import { NavMenu } from "@shopify/app-bridge-react";
import polarisStyles from "@shopify/polaris/build/esm/styles.css?url";
import { authenticate } from "../shopify.server";
import { Link, Outlet, useLoaderData } from "@remix-run/react";

export const links = () => [{ rel: "stylesheet", href: polarisStyles }];

export const loader = async ({ request }) => {
  await authenticate.admin(request);
  return { apiKey: process.env.SHOPIFY_API_KEY || "" };
};

export default function App() {
  const { apiKey } = useLoaderData();
  return (
    <AppProvider isEmbeddedApp apiKey={apiKey}>
      <NavMenu>
        <Link to="/app" rel="home">Home</Link>
        <Link to="/app/additional">Additional page</Link>
        <Link to="/app/tracked-items">Tracked Items</Link>
        <Link to="/app/stats">Stats</Link>
        {/* ← New Settings link */}
        <Link to="/app/settings">Settings</Link>
      </NavMenu>
      {/* Renders nested <app.* /> routes, including /app/settings */}
      <Outlet />
    </AppProvider>
  );
}