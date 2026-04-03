// app/routes/feeds.$shop.meta[.json].ts
// Public Meta (Facebook) product catalog feed at /feeds/{shop}/meta.json
// Submit this URL to Meta Commerce Manager.

import { json, type LoaderFunctionArgs } from "@remix-run/node";
import db from "~/db.server";

const CORS = { "Access-Control-Allow-Origin": "*", "Cache-Control": "public, max-age=3600" };

export async function loader({ params }: LoaderFunctionArgs) {
  const shop = params.shop as string;
  if (!shop) return new Response("Not found", { status: 404 });

  const anyDb = db as any;
  const products: any[] = await anyDb.productFeedItem?.findMany?.({
    where: { shop },
    orderBy: { updatedAt: "desc" },
    take: 5000,
  }).catch(() => []) ?? [];

  const storeUrl = `https://${shop}`;

  const data = products.flatMap((p) => {
    const variants: any[] = (() => { try { return JSON.parse(p.variantsJson || "[]"); } catch { return []; } })();
    const images: string[] = (() => { try { return JSON.parse(p.imagesJson || "[]"); } catch { return []; } })();
    const mainImage = images[0] ?? "";

    // Emit one item per variant for Meta (required for variant-level targeting)
    const rows = variants.length > 0 ? variants : [{ id: null, price: p.price, available: p.available, sku: p.sku, barcode: p.barcode, title: null }];

    return rows.map((v) => ({
      id: v.id ? `${p.productId}_${v.id}` : p.productId,
      title: v.title && v.title !== "Default Title" ? `${p.title} - ${v.title}` : p.title,
      description: (p.bodyHtml ?? "").replace(/<[^>]*>/g, "").slice(0, 9999),
      availability: (v.available ?? p.available) ? "in stock" : "out of stock",
      condition: "new",
      price: `${v.price ?? p.price ?? "0.00"} ${p.currency ?? "USD"}`,
      link: `${storeUrl}/products/${p.handle}${v.id ? `?variant=${v.id}` : ""}`,
      image_link: mainImage,
      brand: p.vendor ?? shop.replace(".myshopify.com", ""),
      google_product_category: p.productType ?? "",
      item_group_id: p.productId,
      gtin: v.barcode ?? p.barcode ?? undefined,
      mpn: v.sku ?? p.sku ?? undefined,
    }));
  });

  return new Response(JSON.stringify({ data }, null, 2), {
    status: 200,
    headers: { "Content-Type": "application/json; charset=utf-8", ...CORS },
  });
}
