// app/routes/webhooks.product-feed.ts
// Receives Shopify product update/create webhooks for auto-sync.

import { type ActionFunctionArgs } from "@remix-run/node";
import db from "~/db.server";

export async function action({ request }: ActionFunctionArgs) {
  const shop = request.headers.get("x-shopify-shop-domain") ?? "";
  if (!shop) return new Response("Missing shop", { status: 400 });

  const anyDb = db as any;
  const config = await anyDb.productFeedConfig?.findUnique?.({ where: { shop } }).catch(() => null);
  if (!config?.autoSync) return new Response("Auto-sync not enabled", { status: 200 });

  // Parse the product payload
  const body = await request.json().catch(() => null);
  if (!body?.id) return new Response("No product", { status: 200 });

  const productId = String(body.id);
  const available = (body.variants ?? []).some((v: any) => v.inventory_quantity > 0 || v.inventory_management === null);
  const images = (body.images ?? []).map((img: any) => img.src);
  const variants = (body.variants ?? []).map((v: any) => ({
    id: String(v.id),
    title: v.title,
    price: v.price,
    compareAtPrice: v.compare_at_price,
    sku: v.sku,
    barcode: v.barcode,
    available: v.inventory_quantity > 0 || v.inventory_management === null,
  }));

  if (body.status === "archived" || body.status === "draft") {
    // Remove from feed
    await anyDb.productFeedItem?.deleteMany?.({ where: { shop, productId } }).catch(() => null);
  } else {
    const excludeOutOfStock = config?.excludeOutOfStock ?? false;
    if (excludeOutOfStock && !available) {
      await anyDb.productFeedItem?.deleteMany?.({ where: { shop, productId } }).catch(() => null);
    } else {
      await anyDb.productFeedItem?.upsert?.({
        where: { shop_productId: { shop, productId } },
        create: {
          shop, productId,
          title: body.title ?? "", handle: body.handle ?? "",
          bodyHtml: body.body_html ?? "",
          productType: body.product_type ?? "",
          vendor: body.vendor ?? "",
          price: variants[0]?.price ?? "0.00",
          currency: "USD",
          available,
          compareAtPrice: variants[0]?.compareAtPrice ?? null,
          sku: variants[0]?.sku ?? null,
          barcode: variants[0]?.barcode ?? null,
          imagesJson: JSON.stringify(images),
          variantsJson: JSON.stringify(variants),
        },
        update: {
          title: body.title ?? "", handle: body.handle ?? "",
          bodyHtml: body.body_html ?? "",
          productType: body.product_type ?? "",
          vendor: body.vendor ?? "",
          price: variants[0]?.price ?? "0.00",
          available,
          compareAtPrice: variants[0]?.compareAtPrice ?? null,
          sku: variants[0]?.sku ?? null,
          barcode: variants[0]?.barcode ?? null,
          imagesJson: JSON.stringify(images),
          variantsJson: JSON.stringify(variants),
        },
      }).catch(() => null);
    }
  }

  // Update product count
  const count = await anyDb.productFeedItem?.count?.({ where: { shop } }).catch(() => 0) ?? 0;
  await anyDb.productFeedConfig?.update?.({
    where: { shop },
    data: { lastSyncedAt: new Date(), productCount: count },
  }).catch(() => null);

  return new Response("OK", { status: 200 });
}
