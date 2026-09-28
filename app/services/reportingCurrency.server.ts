// app/services/reportingCurrency.server.ts
// The currency every report is shown in.
//
// Order values are stored in the shop's own currency and are never converted,
// so reports are always labelled in that currency. Ad spend from an ad account
// in another currency is converted into it (see the Meta/Google loaders).
// Labelling order revenue with any other currency would show the right number
// with the wrong symbol, so the shop currency from Shopify always wins.

import db from "~/db.server";

type Admin = { graphql: (query: string) => Promise<Response> };

const cache = new Map<string, { currency: string; at: number }>();
const CACHE_MS = 30 * 60 * 1000;

export async function getReportingCurrency(shop: string, admin?: Admin | null): Promise<string> {
  const hit = cache.get(shop);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.currency;

  let currency: string | null = null;
  if (admin) {
    try {
      const res = await admin.graphql(`{ shop { currencyCode } }`);
      currency = ((await res.json()) as any)?.data?.shop?.currencyCode ?? null;
    } catch {}
  }
  if (!currency) {
    // No admin client (or Shopify unavailable): last value we saved.
    const s = await db.trackingSettings.findUnique({ where: { shop }, select: { storeCurrency: true } }).catch(() => null);
    currency = s?.storeCurrency ?? null;
  }
  currency = currency || "USD";

  cache.set(shop, { currency, at: Date.now() });
  // Keep a copy for code paths without an admin client (webhooks, crons).
  db.trackingSettings
    .upsert({ where: { shop }, create: { shop, storeCurrency: currency }, update: { storeCurrency: currency } })
    .catch(() => null);
  return currency;
}
