// app/routes/api.product-feed.sync.ts
// Syncs Shopify products into ProductFeedItem table.

import { json, type ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "~/shopify.server";
import db from "~/db.server";

const PRODUCTS_QUERY = `
  query GetProducts($cursor: String) {
    products(first: 250, after: $cursor) {
      pageInfo { hasNextPage endCursor }
      edges {
        node {
          id title handle descriptionHtml productType vendor status
          createdAt updatedAt
          priceRangeV2 { minVariantPrice { amount currencyCode } }
          images(first: 11) { edges { node { url } } }
          variants(first: 100) {
            edges {
              node {
                id title price compareAtPrice sku barcode availableForSale
              }
            }
          }
        }
      }
    }
  }
`;

export async function action({ request }: ActionFunctionArgs) {
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;
  const anyDb = db as any;

  const config = await anyDb.productFeedConfig?.findUnique?.({ where: { shop } }).catch(() => null);
  const excludeOutOfStock = config?.excludeOutOfStock ?? false;
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000);

  let cursor: string | null = null;
  let totalSynced = 0;
  let hasNextPage = true;

  while (hasNextPage) {
    const res = await admin.graphql(PRODUCTS_QUERY, { variables: { cursor } });
    const j = await res.json();
    const products = j?.data?.products;
    if (!products) break;

    hasNextPage = products.pageInfo.hasNextPage;
    cursor = products.pageInfo.endCursor;

    for (const edge of products.edges) {
      const p = edge.node;
      if (p.status !== "ACTIVE") continue;

      const images = p.images.edges.map((e: any) => e.node.url);
      const variants = p.variants.edges.map((e: any) => ({
        id: e.node.id.replace("gid://shopify/ProductVariant/", ""),
        title: e.node.title,
        price: e.node.price,
        compareAtPrice: e.node.compareAtPrice,
        sku: e.node.sku,
        barcode: e.node.barcode,
        available: e.node.availableForSale,
      }));

      const available = variants.some((v: any) => v.available);
      if (excludeOutOfStock && !available) continue;

      const productId = p.id.replace("gid://shopify/Product/", "");
      const price = p.priceRangeV2?.minVariantPrice?.amount ?? "0.00";
      const currency = p.priceRangeV2?.minVariantPrice?.currencyCode ?? "USD";
      const isNew = new Date(p.createdAt) > thirtyDaysAgo;
      const onSale = variants.some((v: any) => v.compareAtPrice && parseFloat(v.compareAtPrice) > parseFloat(v.price || "0"));

      // Build custom labels
      const customLabels: Record<string, string> = {};
      if (onSale) customLabels["custom_label_0"] = "sale";
      if (isNew) customLabels["custom_label_1"] = "new";
      if (!available) customLabels["custom_label_2"] = "out_of_stock";
      const hasGtin = variants.some((v: any) => v.barcode || v.sku);
      if (!hasGtin) customLabels["custom_label_3"] = "no_gtin";

      await anyDb.productFeedItem?.upsert?.({
        where: { shop_productId: { shop, productId } },
        create: {
          shop, productId,
          title: p.title, handle: p.handle,
          bodyHtml: p.descriptionHtml ?? "",
          productType: p.productType ?? "",
          vendor: p.vendor ?? "",
          price, currency, available,
          compareAtPrice: variants[0]?.compareAtPrice ?? null,
          sku: variants[0]?.sku ?? null,
          barcode: variants[0]?.barcode ?? null,
          imagesJson: JSON.stringify(images),
          variantsJson: JSON.stringify(variants),
        },
        update: {
          title: p.title, handle: p.handle,
          bodyHtml: p.descriptionHtml ?? "",
          productType: p.productType ?? "",
          vendor: p.vendor ?? "",
          price, currency, available,
          compareAtPrice: variants[0]?.compareAtPrice ?? null,
          sku: variants[0]?.sku ?? null,
          barcode: variants[0]?.barcode ?? null,
          imagesJson: JSON.stringify(images),
          variantsJson: JSON.stringify(variants),
        },
      }).catch(() => null);

      totalSynced++;
    }
  }

  await anyDb.productFeedConfig?.upsert?.({
    where: { shop },
    create: { shop, lastSyncedAt: new Date(), productCount: totalSynced },
    update: { lastSyncedAt: new Date(), productCount: totalSynced },
  }).catch(() => null);

  return json({ ok: true, totalSynced });
}
