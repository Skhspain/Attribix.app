// app/routes/app.jsx
import { json } from "@remix-run/node";
import { Outlet, useLoaderData } from "@remix-run/react";
import { AppProvider } from "@shopify/shopify-app-remix/react";
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

/**
 * Avoid revalidating the authenticated app shell after settings fetcher posts.
 * The settings route action already returns the updated data needed by the UI.
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

export default function AppRoute() {
  const { apiKey } = useLoaderData();

  return (
    <AppProvider apiKey={apiKey} isEmbeddedApp>
      <Outlet />
    </AppProvider>
  );
}