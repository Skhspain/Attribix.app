// app/routes/api.backfill.customers.ts
// Pulls Shopify customers who accepted email marketing into newsletterSubscriber.
// Respects existing unsubscribed status — will not re-subscribe someone who opted out.
import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { authenticate } from "~/shopify.server";
import db from "~/db.server";

const CUSTOMERS_QUERY = `#graphql
  query BackfillCustomers($first: Int!, $after: String) {
    customers(
      first: $first
      after: $after
      query: "email_marketing_consent.marketing_state:subscribed"
      sortKey: CREATED_AT
      reverse: true
    ) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id
        email
        firstName
        lastName
        emailMarketingConsent { marketingState }
        createdAt
      }
    }
  }
`;

export async function action({ request }: ActionFunctionArgs) {
  try {
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;

  const form = await request.formData().catch(() => new FormData());
  const maxPages = Math.min(parseInt((form.get("maxPages") as string) || "8", 10), 40);

  let cursor: string | null = null;
  let created = 0;
  let skipped = 0;
  let page = 0;

  while (page < maxPages) {
    page++;

    const res = await admin.graphql(CUSTOMERS_QUERY, {
      variables: { first: 250, after: cursor ?? undefined },
    });
    const data = await res.json();
    const customers = data?.data?.customers;
    if (!customers?.nodes?.length) break;

    for (const customer of customers.nodes) {
      const email = (customer.email as string | null)?.toLowerCase().trim();
      if (!email || !email.includes("@")) { skipped++; continue; }

      // Only import if Shopify says they're subscribed
      const state = customer.emailMarketingConsent?.marketingState;
      if (state !== "SUBSCRIBED") { skipped++; continue; }

      const firstName = (customer.firstName as string | null) || null;
      const lastName  = (customer.lastName  as string | null) || null;
      const createdAt = customer.createdAt ? new Date(customer.createdAt) : new Date();

      try {
        const existing = await db.newsletterSubscriber.findUnique({
          where: { shop_email: { shop, email } },
        });

        if (existing) {
          // Never re-subscribe someone who explicitly unsubscribed in Attribix
          if (existing.status === "unsubscribed") { skipped++; continue; }
          skipped++;
          continue;
        }

        await db.newsletterSubscriber.create({
          data: {
            shop,
            email,
            firstName,
            lastName,
            status: "subscribed",
            source: "shopify",
            createdAt,
          },
        });
        created++;
      } catch (e: any) {
        if (e?.code === "P2002") { skipped++; continue; }
        console.error("[backfill/customers] row error", e?.message);
      }
    }

    if (!customers.pageInfo.hasNextPage) break;
    cursor = customers.pageInfo.endCursor;
  }

  return json({ ok: true, created, skipped, pages: page });
  } catch (e: any) {
    console.error("[backfill/customers] action error:", e?.message);
    return json({ ok: false, error: e?.message || "Import failed. Please try again." });
  }
}
