// app/routes/webhooks.gdpr.customers_data_request.tsx
// Mandatory GDPR compliance webhook — customers/data_request
// Shopify sends this when a customer requests their data.
// Must verify HMAC (shopify.authenticate.webhook handles this) and return 200.
import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import shopify from "~/shopify.server";

export async function action({ request }: ActionFunctionArgs) {
  // NOTE: authenticate.webhook MUST be called outside any try-catch.
  // If HMAC verification fails, it throws a Response (400) which Remix
  // propagates correctly. Catching it and returning 500 makes Shopify
  // think HMAC verification is not implemented.
  const { shop, payload } = await shopify.authenticate.webhook(request);

  console.log(`[gdpr] customers/data_request received for shop: ${shop}`);
  // We don't store PII beyond what's needed for attribution.
  // Log the request — no further action required for this app.

  return json({ ok: true });
}
