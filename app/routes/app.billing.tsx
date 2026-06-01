// app/routes/app.billing.tsx
// Billing gate — uses shopify-app-remix's exit-iframe mechanism to redirect
// the merchant to Shopify's managed pricing page without needing client-side JS.

import { redirect, type LoaderFunctionArgs } from "@remix-run/node";
import { authenticate } from "~/shopify.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);

  const shopHandle = session.shop.replace(".myshopify.com", "");
  // Shopify Managed Pricing URL uses the app *handle* (from shopify.app.toml),
  // NOT the API key / client_id. Using the API key causes Shopify to bounce
  // the merchant back to the app without showing plan selection.
  const APP_HANDLE = process.env.SHOPIFY_APP_HANDLE || "attribix-app";
  const pricingUrl = `https://admin.shopify.com/store/${shopHandle}/charges/${APP_HANDLE}/pricing_plans`;

  // Use shopify-app-remix's exit-iframe redirect so App Bridge properly
  // navigates the top-level Shopify admin window to the pricing page.
  // Direct window.top manipulation is blocked in Shopify's sandboxed iframe.
  const url = new URL(request.url);
  const shop = session.shop;
  const host = url.searchParams.get("host") ?? "";

  console.log(`[billing] redirecting ${shop} → ${pricingUrl} (host=${host ? "present" : "missing"}, handle=${APP_HANDLE})`);

  const exitIframeParams = new URLSearchParams({ shop, host, exitIframe: pricingUrl });
  throw redirect(`/auth/exit-iframe?${exitIframeParams.toString()}`);
}

// No component needed — the loader always redirects.
export default function BillingRedirect() {
  return null;
}
