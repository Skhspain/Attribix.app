// app/routes/api.reviews.feed.ts
// GET /api/reviews/feed?shop=mystore.myshopify.com&token=<hmac>
// Returns a Google Product Ratings XML feed (schema 2.3) for all approved reviews.
// Token is HMAC-SHA256(shop, SHOPIFY_API_SECRET) — no DB lookup needed.

import type { LoaderFunctionArgs } from "@remix-run/node";
import db from "~/db.server";

// Dynamic import keeps node:crypto out of the browser bundle (Vite treats
// top-level Node built-in imports as browser-incompatible in route files).
async function makeFeedToken(shop: string): Promise<string> {
  const { createHmac } = await import("node:crypto");
  const secret = process.env.SHOPIFY_API_SECRET ?? "attribix-feed-fallback";
  return createHmac("sha256", secret).update(shop).digest("hex").slice(0, 32);
}

/** Wrap a string in a CDATA section, escaping any embedded ]]> */
function cdata(str: string): string {
  return `<![CDATA[${str.replace(/]]>/g, "]]]]><![CDATA[>")}]]>`;
}

/** Best-guess Shopify handle from a product title */
function toHandle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop") ?? "";
  const token = url.searchParams.get("token") ?? "";

  if (!shop || !token || token !== await makeFeedToken(shop)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const anyDb = db as any;
  const reviews: any[] = await anyDb.review.findMany({
    where: { shop, status: "approved" },
    orderBy: { createdAt: "desc" },
    take: 1000,
  });

  const storeBase = `https://${shop}`;
  const storeName = shop.replace(".myshopify.com", "");

  const reviewsXml = reviews
    .map((r) => {
      const isManual = !r.productId || r.productId === "manual";
      const handle = r.productTitle ? toHandle(r.productTitle) : "";
      const productUrl =
        !isManual && handle ? `${storeBase}/products/${handle}` : storeBase;
      const timestamp = new Date(r.createdAt)
        .toISOString()
        .replace(/\.\d+Z$/, "+00:00");
      const mpn = isManual ? `manual-${r.id}` : r.productId;

      return `    <review>
      <review_id>${cdata(r.id)}</review_id>
      <reviewer>
        <name>${cdata(r.reviewerName || "Anonymous")}</name>
        <is_anonymous>${r.reviewerName ? "FALSE" : "TRUE"}</is_anonymous>
      </reviewer>
      <review_timestamp>${timestamp}</review_timestamp>
      <content>${cdata(r.body ?? "")}</content>${
        r.title ? `\n      <title>${cdata(r.title)}</title>` : ""
      }
      <review_url type="singleton">${productUrl}</review_url>
      <ratings>
        <overall min="1" max="5">${r.rating}</overall>
      </ratings>
      <products>
        <product>
          <product_ids>
            <mpns>
              <mpn>${cdata(mpn)}</mpn>
            </mpns>
          </product_ids>
          <product_name>${cdata(r.productTitle ?? "")}</product_name>
          <product_url>${productUrl}</product_url>
        </product>
      </products>
    </review>`;
    })
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns:vc="http://www.w3.org/2007/XMLSchema-versioning"
      xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
      xsi:noNamespaceSchemaLocation="http://www.google.com/shopping/reviews/schema/2.3/product_reviews.xsd">
  <version>2.3</version>
  <aggregator>
    <name>Attribix</name>
  </aggregator>
  <publisher>
    <name>${storeName}</name>
    <favicon>${storeBase}/favicon.ico</favicon>
  </publisher>
  <reviews>
${reviewsXml}
  </reviews>
</feed>`;

  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
