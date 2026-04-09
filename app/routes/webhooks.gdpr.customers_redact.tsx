// app/routes/webhooks.gdpr.customers_redact.tsx
// Mandatory GDPR compliance webhook — customers/redact
// Shopify sends this when a customer requests deletion of their data.
import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import shopify from "~/shopify.server";
import { db } from "~/db.server";

export async function action({ request }: ActionFunctionArgs) {
  // authenticate.webhook must be OUTSIDE try-catch so HMAC failures
  // propagate as a proper 400 Response rather than being caught as 500.
  const { shop, payload } = await shopify.authenticate.webhook(request);

  console.log(`[gdpr] customers/redact received for shop: ${shop}`);

  try {
    const customerId = payload?.customer?.id ? String(payload.customer.id) : null;
    const email = payload?.customer?.email || null;

    // Redact any stored data we can identify by email
    if (email) {
      // Anonymise newsletter subscribers
      await (db as any).newsletterSubscriber?.updateMany?.({
        where: { shop, email },
        data: { email: `redacted_${Date.now()}@deleted`, firstName: null, lastName: null },
      }).catch(() => null);

      // Anonymise leads
      await (db as any).lead?.updateMany?.({
        where: { shop, email },
        data: { email: `redacted_${Date.now()}@deleted`, firstName: null, lastName: null, phone: null },
      }).catch(() => null);
    }
  } catch (err: any) {
    console.error("[gdpr] customers_redact processing error:", err?.message);
  }

  return json({ ok: true });
}
