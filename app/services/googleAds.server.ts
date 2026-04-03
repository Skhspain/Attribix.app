// app/services/googleAds.server.ts

import { getValidGoogleToken } from "~/services/tokenRefresh.server";

const GOOGLE_ADS_API_VERSION = process.env.GOOGLE_ADS_API_VERSION || "v23";

/**
 * Google Ads API sometimes returns an HTML error page when the request is malformed
 * (wrong method/path/version). We guard and show a helpful error snippet.
 */
function isProbablyHtml(s: string) {
  const t = s.trim().toLowerCase();
  return t.startsWith("<!doctype html") || t.startsWith("<html");
}

async function googleAdsFetch(opts: {
  path: string; // e.g. "/customers:listAccessibleCustomers"
  accessToken: string;
  developerToken?: string;
  loginCustomerId?: string;
  method?: "GET" | "POST";
  body?: any;
}) {
  if (!opts.accessToken) throw new Error("Missing Google access token");

  const url = `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}${opts.path}`;

  const headers: Record<string, string> = {
    Authorization: `Bearer ${opts.accessToken}`,
    Accept: "application/json",
  };

  // Many Google Ads API calls require developer-token.
  if (opts.developerToken) headers["developer-token"] = opts.developerToken;

  // Some calls need login-customer-id, but ListAccessibleCustomers explicitly ignores it.
  if (opts.loginCustomerId) headers["login-customer-id"] = opts.loginCustomerId;

  const method = opts.method ?? "POST";

  let body: string | undefined;
  if (method === "POST") {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(opts.body ?? {});
  }

  const res = await fetch(url, {
    method,
    headers,
    body,
    redirect: "manual",
  });

  const text = await res.text();

  if (res.status >= 300 && res.status < 400) {
    const loc = res.headers.get("location");
    throw new Error(`Google Ads API redirect (${res.status}) to ${loc ?? "(no location)"}`);
  }

  if (!res.ok) {
    // This is what you're seeing: HTML 404 page when method/path is wrong
    throw new Error(
      `Google Ads API error (${res.status}) on ${opts.path}: ${text.slice(0, 1200)}`
    );
  }

  if (isProbablyHtml(text)) {
    throw new Error(
      `Google Ads API returned HTML (expected JSON) on ${opts.path}: ${text.slice(0, 600)}`
    );
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new Error(
      `Google Ads API returned non-JSON on ${opts.path}: ${text.slice(0, 600)}`
    );
  }
}

/**
 * ✅ Correct per Google docs: GET /customers:listAccessibleCustomers
 * Requires: Authorization + developer-token
 */
export async function listAccessibleCustomers(args: {
  accessToken: string;
  developerToken?: string;
}) {
  const developerToken = args.developerToken ?? process.env.GOOGLE_ADS_DEVELOPER_TOKEN;

  if (!developerToken) {
    throw new Error("Missing GOOGLE_ADS_DEVELOPER_TOKEN");
  }

  const data = await googleAdsFetch({
    path: "/customers:listAccessibleCustomers",
    accessToken: args.accessToken,
    developerToken,
    method: "GET",
  });

  const resourceNames: string[] = Array.isArray(data?.resourceNames) ? data.resourceNames : [];

  return resourceNames.map((rn) => {
    const id = rn.split("/")[1] ?? rn;

    // UI expects { id, name } (and uses id as label fallback)
    return {
      id,
      name: null,
      resourceName: rn,
    };
  });
}

/**
 * ✅ Used by spend sync (GAQL via searchStream).
 */
export async function googleAdsSearchStream(args: {
  accessToken: string;
  customerId: string;
  query: string;
  developerToken?: string;
  loginCustomerId?: string;
}) {
  const developerToken = args.developerToken ?? process.env.GOOGLE_ADS_DEVELOPER_TOKEN;

  if (!developerToken) {
    throw new Error("Missing GOOGLE_ADS_DEVELOPER_TOKEN");
  }

  const data = await googleAdsFetch({
    path: `/customers/${args.customerId}/googleAds:searchStream`,
    accessToken: args.accessToken,
    developerToken,
    loginCustomerId: args.loginCustomerId,
    method: "POST",
    body: { query: args.query },
  });

  // searchStream returns an array of "SearchGoogleAdsStreamResponse"
  return Array.isArray(data) ? data : [];
}

/**
 * Syncs Google Ads campaign metrics (spend, impressions, clicks, conversions, conversion_value)
 * into GoogleCampaignDailyInsight and also aggregates total spend into AdSpendDaily.
 */
export async function syncGoogleSpendDaily(args: {
  shop: string;
  accessToken: string;
  customerId: string;
  days?: number;
  developerToken?: string;
  loginCustomerId?: string;
}) {
  const developerToken = args.developerToken ?? process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
  const loginCustomerId = args.loginCustomerId ?? process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID;
  const days = Math.min(args.days ?? 30, 90);
  const customerId = args.customerId.replace(/-/g, "");

  // ── Auto-refresh access token if expired ──────────────────────────────────
  let accessToken = args.accessToken;
  if (args.shop) {
    const refreshResult = await getValidGoogleToken(args.shop);
    if (refreshResult.ok) {
      accessToken = refreshResult.accessToken;
    } else {
      console.warn(`[googleAds] Token refresh failed for ${args.shop}: ${refreshResult.reason}. Proceeding with stored token.`);
    }
  }

  if (!developerToken) throw new Error("Missing GOOGLE_ADS_DEVELOPER_TOKEN");

  const today = new Date();
  const since = new Date(today);
  since.setDate(today.getDate() - (days - 1));

  function fmt(d: Date) {
    return d.toISOString().slice(0, 10);
  }

  const query = `
    SELECT
      campaign.id,
      campaign.name,
      metrics.cost_micros,
      metrics.impressions,
      metrics.clicks,
      metrics.conversions,
      metrics.conversions_value,
      segments.date
    FROM campaign
    WHERE segments.date BETWEEN '${fmt(since)}' AND '${fmt(today)}'
      AND campaign.status != 'REMOVED'
    ORDER BY segments.date DESC
  `;

  const streamResults = await googleAdsSearchStream({
    accessToken,
    customerId,
    query,
    developerToken,
    loginCustomerId,
  });

  const rows: Array<{
    campaign: { id: string; name: string };
    metrics: { costMicros: string; impressions: string; clicks: string; conversions: string; conversionsValue: string };
    segments: { date: string };
  }> = streamResults.flatMap((chunk: any) => chunk?.results ?? []);

  if (!rows.length) {
    return { ok: true, shop: args.shop, upserted: 0, message: "No campaign data returned" };
  }

  const { db } = await import("~/db.server");
  const anyDb = db as any;
  let upserted = 0;

  // Aggregate total spend per day for AdSpendDaily (one row per day for backward compat)
  const dailyTotals = new Map<string, number>();

  for (const row of rows) {
    const campaignId = row.campaign?.id ?? "unknown";
    const campaignName = row.campaign?.name ?? null;
    const spend = Number(row.metrics?.costMicros ?? 0) / 1_000_000;
    const impressions = Number(row.metrics?.impressions ?? 0);
    const clicks = Number(row.metrics?.clicks ?? 0);
    const conversions = Number(row.metrics?.conversions ?? 0);
    const conversionValue = Number(row.metrics?.conversionsValue ?? 0);
    const dateStr = row.segments?.date;

    if (!dateStr) continue;

    const date = new Date(dateStr + "T00:00:00Z");

    // Accumulate daily total for AdSpendDaily
    const prev = dailyTotals.get(dateStr) ?? 0;
    dailyTotals.set(dateStr, prev + spend);

    // Upsert campaign-level insight
    try {
      await anyDb.googleCampaignDailyInsight.upsert({
        where: { google_shop_date_campaignId: { shop: args.shop, date, campaignId } },
        update: { campaignName, spend, impressions, clicks, conversions, conversionValue },
        create: { shop: args.shop, date, campaignId, campaignName, spend, impressions, clicks, conversions, conversionValue },
      });
      upserted++;
    } catch (rowErr: any) {
      console.error(`[googleAds] Failed to upsert campaign row shop=${args.shop} campaignId=${campaignId} date=${dateStr}: ${rowErr?.message}`);
    }
  }

  // Update AdSpendDaily aggregates
  for (const [dateStr, totalSpend] of dailyTotals) {
    const date = new Date(dateStr + "T00:00:00Z");
    try {
      await anyDb.adSpendDaily.upsert({
        where: { shop_platform_date: { shop: args.shop, platform: "google", date } },
        update: { spend: totalSpend },
        create: { shop: args.shop, platform: "google", date, spend: totalSpend, campaign: null, adset: null, ad: null },
      });
    } catch { /* skip */ }
  }

  // Update lastSyncedAt on the connection
  try {
    await anyDb.googleConnection.update({
      where: { shop: args.shop },
      data: { lastSyncedAt: new Date() },
    });
  } catch { /* skip */ }

  return { ok: true, shop: args.shop, upserted, total: rows.length };
}

// Backwards compatible alias (some routes still import syncGoogleSpend)
export const syncGoogleSpend = syncGoogleSpendDaily;
