// app/routes/webhooks.gdpr.customers_data_request.tsx
// Mandatory GDPR compliance webhook — customers/data_request
// Shopify sends this when a customer requests their data.
//
// Shopify requires the app to respond with HTTP 200 after verifying HMAC;
// the actual fulfillment (returning the data to the customer) must happen
// within 30 days. We gather the stored records for the customer and log
// them in a structured way so the shop owner / app operator can action
// the request.
import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import shopify from "~/shopify.server";
import { db } from "~/db.server";

export async function action({ request }: ActionFunctionArgs) {
  // NOTE: authenticate.webhook MUST be called outside any try-catch.
  // If HMAC verification fails, it throws a Response (400) which Remix
  // propagates correctly. Catching it and returning 500 would make Shopify
  // think HMAC verification is not implemented.
  const { shop, payload } = await shopify.authenticate.webhook(request);

  const customerId = payload?.customer?.id ? String(payload.customer.id) : null;
  const email: string | null = payload?.customer?.email || null;
  const phone: string | null = payload?.customer?.phone || null;
  const ordersRequested: string[] = Array.isArray(payload?.orders_requested)
    ? payload.orders_requested.map((o: any) => String(o))
    : [];

  console.log(
    `[gdpr] customers/data_request received for shop=${shop} customerId=${customerId} email=${email}`,
  );

  // Best-effort lookup of any personally-identifiable data we've stored for
  // this customer across the app's tables. We never fail the webhook — if
  // any table/model is unavailable we just skip it.
  const collected: Record<string, unknown[]> = {};
  const anyDb = db as any;

  if (email) {
    try {
      collected.newsletterSubscribers = await anyDb.newsletterSubscriber
        ?.findMany?.({ where: { shop, email } })
        .catch(() => []);
    } catch {}
    try {
      collected.leads = await anyDb.lead?.findMany?.({ where: { shop, email } }).catch(() => []);
    } catch {}
    try {
      collected.reviews = await anyDb.review
        ?.findMany?.({ where: { shop, OR: [{ email }, { customerEmail: email }] } })
        .catch(() => []);
    } catch {}
    try {
      collected.purchases = await anyDb.purchase
        ?.findMany?.({ where: { shop, OR: [{ email }, { customerEmail: email }] } })
        .catch(() => []);
    } catch {}
  }

  if (ordersRequested.length) {
    try {
      collected.ordersByRequestedId = await anyDb.purchase
        ?.findMany?.({ where: { shop, orderId: { in: ordersRequested } } })
        .catch(() => []);
    } catch {}
  }

  const summary = Object.fromEntries(
    Object.entries(collected).map(([k, v]) => [k, Array.isArray(v) ? v.length : 0]),
  );

  // Structured log so the operator can locate and fulfill the request within
  // Shopify's 30-day window. Consider forwarding to an email / ticketing system.
  console.log(
    `[gdpr] customers/data_request summary shop=${shop} customerId=${customerId} counts=${JSON.stringify(summary)}`,
  );

  return json({ ok: true, summary });
}
