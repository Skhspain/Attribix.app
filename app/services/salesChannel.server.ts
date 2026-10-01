// Fills Purchase.salesChannel (Shopify's source_name) for orders saved before
// it was stored, so reports can tell offline orders (draft orders/invoices,
// POS) apart from online orders whose visit wasn't seen. Only orders still
// missing it are fetched, so after the first run this is a single DB count.
import db from "~/db.server";

const QUERY = `#graphql
  query OrderSources($ids: [ID!]!) {
    nodes(ids: $ids) { ... on Order { legacyResourceId sourceName } }
  }`;

export async function fillSalesChannels(shop: string, admin: any, since: Date): Promise<number> {
  const missing = await db.purchase.findMany({
    where: { shop, createdAt: { gte: since }, salesChannel: null },
    select: { id: true, orderId: true },
    take: 250,
  }).catch(() => []);
  // Only numeric Shopify order ids can be looked up.
  const rows = missing
    .filter((r) => !!r.orderId && /^\d+$/.test(r.orderId))
    .map((r) => ({ id: r.id, orderId: r.orderId as string }));
  if (rows.length === 0) return 0;

  const res = await admin.graphql(QUERY, { variables: { ids: rows.map((r) => `gid://shopify/Order/${r.orderId}`) } });
  const nodes: any[] = (await res.json())?.data?.nodes ?? [];
  // Shopify returns no sourceName for some orders; store "unknown" so they
  // aren't looked up again on every page load.
  const byId = new Map<string, string>(nodes.filter(Boolean).map((n) => [String(n.legacyResourceId), (n.sourceName as string | null) || "unknown"]));

  let filled = 0;
  for (const r of rows) {
    const channel = byId.get(r.orderId);
    if (!channel) continue;
    await db.purchase.update({ where: { id: r.id }, data: { salesChannel: channel } }).catch(() => null);
    filled++;
  }
  return filled;
}
