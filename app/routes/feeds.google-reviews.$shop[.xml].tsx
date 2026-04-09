// app/routes/feeds.google-reviews.$shop[.xml].tsx
// Google Product Reviews feed — register in Google Merchant Center → Marketing → Reviews.
// Format: https://support.google.com/merchants/answer/7562342
// URL: /feeds/google-reviews/{shop}.xml

import type { LoaderFunctionArgs } from "@remix-run/node";
import db from "~/db.server";

function esc(s: string) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function loader({ params }: LoaderFunctionArgs) {
  const shop = decodeURIComponent(params.shop!);
  const anyDb = db as any;

  const reviews = await anyDb.review.findMany({
    where: { shop, status: "approved" },
    orderBy: { createdAt: "desc" },
    take: 2000,
  }).catch(() => []);

  const shopDomain = shop.replace(".myshopify.com", "");
  const storeUrl = `https://${shop}`;
  const now = new Date().toISOString();

  const reviewItems = reviews.map((r: any) => {
    const productUrl = `${storeUrl}/products/${r.productId}`;
    const dateStr = new Date(r.createdAt).toISOString().slice(0, 10);
    return `    <review>
      <review_id>${esc(r.id)}</review_id>
      <reviewer>
        <name>${esc(r.reviewerName)}</name>
        ${r.verifiedPurchase ? "<is_anonymous>false</is_anonymous>" : ""}
      </reviewer>
      <review_timestamp>${esc(new Date(r.createdAt).toISOString())}</review_timestamp>
      <content>${esc(r.body)}</content>
      ${r.title ? `<title>${esc(r.title)}</title>` : ""}
      <review_url type="singleton">${esc(productUrl)}</review_url>
      <ratings>
        <overall min="1" max="5">${r.rating}</overall>
      </ratings>
      ${r.verifiedPurchase ? "<is_verified_purchase>true</is_verified_purchase>" : ""}
      <products>
        <product>
          <product_ids>
            <gtins/>
            <mpns/>
            <skus>
              <sku>${esc(r.productId)}</sku>
            </skus>
          </product_ids>
          <product_name>${esc(r.productTitle || r.productId)}</product_name>
          <product_url>${esc(productUrl)}</product_url>
        </product>
      </products>
    </review>`;
  }).join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns:vc="http://www.w3.org/2007/XMLSchema-versioning"
      xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
      xsi:noNamespaceSchemaLocation="http://www.google.com/shopping/reviews/schema/2.3/product_reviews.xsd">
  <version>2.3</version>
  <aggregator>
    <name>Attribix</name>
  </aggregator>
  <publisher>
    <name>${esc(shopDomain)}</name>
    <favicon>${esc(storeUrl)}/favicon.ico</favicon>
  </publisher>
  <generated_at>${esc(now)}</generated_at>
  <reviews>
${reviewItems}
  </reviews>
</feed>`;

  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
