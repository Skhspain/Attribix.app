// app/routes/feeds.google-shopping.$shop[.xml].tsx
// Public Google Shopping / Merchant Center product feed.
// URL: /feeds/google-shopping/{shop}.xml
// Register this URL in Google Merchant Center → Products → Feeds.

import type { LoaderFunctionArgs } from "@remix-run/node";
import db from "~/db.server";

function esc(s: string) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function getShopifyProducts(shop: string, accessToken: string) {
  const query = `{
    products(first: 250, query: "status:active") {
      edges {
        node {
          id
          title
          descriptionHtml
          handle
          productType
          vendor
          tags
          onlineStoreUrl
          images(first: 1) { edges { node { url } } }
          variants(first: 1) {
            edges {
              node {
                id
                sku
                price
                availableForSale
                barcode
                inventoryQuantity
              }
            }
          }
        }
      }
    }
  }`;

  const res = await fetch(`https://${shop}/admin/api/2024-01/graphql.json`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": accessToken,
    },
    body: JSON.stringify({ query }),
  });

  if (!res.ok) throw new Error(`Shopify API ${res.status}`);
  const json = await res.json() as any;
  return (json?.data?.products?.edges ?? []).map((e: any) => e.node);
}

export async function loader({ params }: LoaderFunctionArgs) {
  const shop = decodeURIComponent(params.shop!);
  const anyDb = db as any;

  // Get access token from session storage
  const session = await anyDb.session.findFirst({
    where: { shop },
    select: { accessToken: true },
  }).catch(() => null);

  if (!session?.accessToken) {
    return new Response("Shop not connected", { status: 404 });
  }

  // Get review ratings per product for the feed
  const reviewAggs = await anyDb.review.groupBy({
    by: ["productId"],
    where: { shop, status: "approved" },
    _avg: { rating: true },
    _count: { id: true },
  }).catch(() => []);

  const ratingMap = new Map<string, { avg: number; count: number }>();
  for (const r of reviewAggs) {
    ratingMap.set(String(r.productId), { avg: r._avg.rating ?? 0, count: r._count.id });
  }

  let products: any[] = [];
  try {
    products = await getShopifyProducts(shop, session.accessToken);
  } catch (e: any) {
    return new Response(`Failed to fetch products: ${e.message}`, { status: 500 });
  }

  const shopDomain = shop.replace(".myshopify.com", "");
  const storeUrl = `https://${shop}`;

  const items = products.map((p: any) => {
    const variant = p.variants?.edges?.[0]?.node;
    const imageUrl = p.images?.edges?.[0]?.node?.url ?? "";
    const price = variant?.price ? `${parseFloat(variant.price).toFixed(2)} NOK` : "";
    const availability = variant?.availableForSale ? "in stock" : "out of stock";
    const link = p.onlineStoreUrl || `${storeUrl}/products/${p.handle}`;
    const gtin = variant?.barcode || "";
    const sku = variant?.sku || "";
    // Strip HTML from description
    const desc = (p.descriptionHtml || p.title).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 5000);

    // Numeric product id from gid://shopify/Product/123
    const numericId = String(p.id).split("/").pop() || p.id;

    return `  <item>
    <g:id>${esc(numericId)}</g:id>
    <g:title>${esc(p.title)}</g:title>
    <g:description>${esc(desc)}</g:description>
    <g:link>${esc(link)}</g:link>
    ${imageUrl ? `<g:image_link>${esc(imageUrl)}</g:image_link>` : ""}
    <g:availability>${availability}</g:availability>
    <g:price>${esc(price)}</g:price>
    <g:brand>${esc(p.vendor || shopDomain)}</g:brand>
    ${p.productType ? `<g:google_product_category>${esc(p.productType)}</g:google_product_category>` : ""}
    ${gtin ? `<g:gtin>${esc(gtin)}</g:gtin>` : ""}
    ${sku ? `<g:mpn>${esc(sku)}</g:mpn>` : ""}
    <g:condition>new</g:condition>
    <g:identifier_exists>${gtin || sku ? "yes" : "no"}</g:identifier_exists>
  </item>`;
  }).join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
  <channel>
    <title>${esc(shopDomain)}</title>
    <link>${esc(storeUrl)}</link>
    <description>Product feed for ${esc(shopDomain)}</description>
${items}
  </channel>
</rss>`;

  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
