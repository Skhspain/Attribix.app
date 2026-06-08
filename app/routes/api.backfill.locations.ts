// app/routes/api.backfill.locations.ts
// Backfills country/city on existing Purchase rows by fetching order data from Shopify GraphQL.
import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { authenticate } from "~/shopify.server";
import db from "~/db.server";

const ORDERS_QUERY = `
  query GetOrders($first: Int!, $after: String) {
    orders(first: $first, after: $after, sortKey: CREATED_AT, reverse: true) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id
        legacyResourceId
        billingAddress { countryCodeV2 city }
        shippingAddress { countryCodeV2 city }
      }
    }
  }
`;

export async function action({ request }: ActionFunctionArgs) {
  const result = await authenticate.admin(request);
  if (result instanceof Response) return result;

  const { admin, session } = result;
  const shop = session.shop;
  const anyDb = db as any;

  // Find purchases that are missing country
  const missing = await anyDb.purchase.findMany({
    where: { shop, country: null },
    select: { id: true, orderId: true },
  });

  if (!missing.length) {
    return json({ ok: true, updated: 0, message: "No purchases need location backfill." });
  }

  // Build lookup: orderId → purchase id
  // orderId may be a GID like "gid://shopify/Order/12345" or just "12345"
  const byGid = new Map<string, string>(); // gid → purchase.id
  const byLegacy = new Map<string, string>(); // legacyId → purchase.id
  for (const p of missing) {
    if (!p.orderId) continue;
    const oid = String(p.orderId);
    if (oid.startsWith("gid://")) {
      byGid.set(oid, p.id);
    } else {
      byLegacy.set(oid, p.id);
    }
  }

  let cursor: string | null = null;
  let updated = 0;
  const MAX_PAGES = 20; // safety — max 20 × 250 = 5000 orders
  let page = 0;

  while (page < MAX_PAGES) {
    page++;
    const res = await admin.graphql(ORDERS_QUERY, {
      variables: { first: 250, after: cursor ?? undefined },
    });
    const data = await res.json();
    const orders = data?.data?.orders;
    if (!orders) break;

    for (const order of orders.nodes) {
      const country =
        order.billingAddress?.countryCodeV2 ||
        order.shippingAddress?.countryCodeV2 ||
        null;
      const city =
        order.billingAddress?.city ||
        order.shippingAddress?.city ||
        null;

      if (!country && !city) continue;

      const purchaseId = byGid.get(order.id) ?? byLegacy.get(order.legacyResourceId) ?? null;
      if (!purchaseId) continue;

      await anyDb.purchase.update({
        where: { id: purchaseId },
        data: { country, city },
      });
      updated++;
    }

    if (!orders.pageInfo.hasNextPage) break;
    cursor = orders.pageInfo.endCursor;
  }

  return json({ ok: true, updated, total: missing.length });
}
