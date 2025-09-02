import { json } from "@remix-run/node";

export async function action({ request }) {
  const { shopify } = await import("../shopify.server"); // server-only import
  // Shopify will run your registered APP_UNINSTALLED handler(s)
  const response = await shopify.webhooks.process({ request });
  return response ?? json({ ok: true });
}

export default null;
