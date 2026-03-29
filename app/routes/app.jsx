// app/routes/app.jsx
import { json } from "@remix-run/node";
import { Link, Outlet, useLoaderData } from "@remix-run/react";
import { AppProvider } from "@shopify/shopify-app-remix/react";
import { NavMenu } from "@shopify/app-bridge-react";
import shopify, { authenticate } from "~/shopify.server";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  await shopify.registerWebhooks({ session });

  return json({
    apiKey:
      process.env.SHOPIFY_API_KEY ||
      process.env.VITE_SHOPIFY_API_KEY ||
      "",
  });
};

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
  if (isSettingsPost && actionResult?.ok) return false;
  return defaultShouldRevalidate;
}

export default function AppRoute() {
  const { apiKey } = useLoaderData();

  return (
    <AppProvider apiKey={apiKey} isEmbeddedApp>
      <NavMenu>
        <Link to="/app" rel="home">Overview</Link>
        <Link to="/app/analytics">Attribution</Link>
        <Link to="/app/orders">Orders</Link>
        <Link to="/app/ads">Integrations</Link>
        <Link to="/app/settings">Settings</Link>
      </NavMenu>
      <Outlet />
    </AppProvider>
  );
}
