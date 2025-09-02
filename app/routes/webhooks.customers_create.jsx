import { json } from "@remix-run/node";

/**
 * Webhook routes should be UI-less; export only `action` and `default null`.
 * We dynamically import both `shopify.server` and `db.server` inside the action.
 */
export async function action({ request }) {
  const [{ shopify }, { db }] = await Promise.all([
    import("../shopify.server"),   // server-only import
    import("../utils/db.server"),  // server-only import
  ]);

  // Let Shopify validate HMAC and dispatch to your registered handlers
  const response = await shopify.webhooks.process({ request });

  // If you also want to persist data after verification, you can parse the body here:
  // const payload = await request.json();
  // await db.customer.upsert({ ...payload... });

  return response ?? json({ ok: true });
}

export default null;
