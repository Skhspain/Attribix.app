// app/services/adCurrency.server.ts
// Exchange rates from each ad account's currency into the reporting currency.
// Ad spend and platform-reported conversion values are stored in the ad
// account's currency; every report converts them the same way through here.

import db from "~/db.server";
import { convertCurrency } from "~/services/currency.server";

type Rates = {
  meta: { rate: number; accountCurrency: string | null };
  google: { rate: number; accountCurrency: string | null };
};

const cache = new Map<string, { rates: Rates; at: number }>();
const CACHE_MS = 6 * 60 * 60 * 1000;

async function metaAccountCurrency(shop: string): Promise<string | null> {
  const conn = await db.metaConnection.findUnique({ where: { shop }, select: { accessToken: true, adAccountId: true } }).catch(() => null);
  if (!conn?.accessToken || conn.accessToken === "__PENDING__" || !conn.adAccountId) return null;
  try {
    const res = await fetch(`https://graph.facebook.com/v20.0/${conn.adAccountId}?fields=currency&access_token=${conn.accessToken}`, {
      signal: AbortSignal.timeout(8000),
    });
    const acct: any = await res.json();
    return acct?.currency && !acct.error ? String(acct.currency) : null;
  } catch {
    return null;
  }
}

async function googleAccountCurrency(shop: string): Promise<string | null> {
  const conn = await (db as any).googleConnection.findUnique({ where: { shop }, select: { adCustomerId: true, currencyCode: true } }).catch(() => null);
  return conn?.currencyCode ?? null;
}

async function rateFor(from: string | null, to: string) {
  if (!from || from === to) return 1;
  return convertCurrency(1, from, to).catch(() => 1);
}

/**
 * When an account's currency is unknown we assume it matches the reporting
 * currency (rate 1) rather than guessing — the old code assumed USD for
 * Google, which misstated spend for every non-US store.
 */
export async function adAccountRates(shop: string, reportingCurrency: string): Promise<Rates> {
  const key = `${shop}|${reportingCurrency}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.rates;

  const [metaCur, googleCur] = await Promise.all([metaAccountCurrency(shop), googleAccountCurrency(shop)]);
  const rates: Rates = {
    meta: { rate: await rateFor(metaCur, reportingCurrency), accountCurrency: metaCur },
    google: { rate: await rateFor(googleCur, reportingCurrency), accountCurrency: googleCur },
  };
  cache.set(key, { rates, at: Date.now() });
  return rates;
}
