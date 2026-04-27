// app/routes/api.report.overview.ts
//
// Public, key-authed endpoint hit by attribix.com /analytics
// (via its Next.js server-side proxy at /api/report/overview).
//
// Auth: header `x-attribix-key: <Org.apiKey>`.
// Scope: returns metrics aggregated across every shop in the caller's Org
//        (Shopify stores, WooCommerce sites, future Kajabi, etc.).
//
// Query params:
//   ?from=ISO-date   (optional, default = 30 days ago)
//   ?to=ISO-date     (optional, default = now)

import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { db } from "~/db.server";
import { getOverview, parseRange } from "~/services/reportOverview.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const apiKey = request.headers.get("x-attribix-key");

  if (!apiKey) {
    return json({ error: "Missing x-attribix-key header" }, { status: 401 });
  }

  const org = await db.org.findUnique({
    where: { apiKey },
    select: { id: true },
  });

  if (!org) {
    return json({ error: "Invalid API key" }, { status: 401 });
  }

  const stores = await db.orgStore.findMany({
    where: { orgId: org.id },
    select: { shop: true },
  });
  const shops = stores.map((s) => s.shop);

  const url = new URL(request.url);
  const { from, to } = parseRange(url.searchParams);

  const result = await getOverview({ shops, from, to });
  return json(result);
}
