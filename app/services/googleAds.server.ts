// app/services/googleAds.server.ts

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
 * Backwards compat for older route: app/routes/api.google.sync-spend.ts
 * If you already store spend in your DB, keep this as your server-side hook.
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
  const days = Math.min(args.days ?? 7, 30);
  const customerId = args.customerId.replace(/-/g, "");

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
      segments.date
    FROM campaign
    WHERE segments.date BETWEEN '${fmt(since)}' AND '${fmt(today)}'
      AND campaign.status != 'REMOVED'
    ORDER BY segments.date DESC
  `;

  const streamResults = await googleAdsSearchStream({
    accessToken: args.accessToken,
    customerId,
    query,
    developerToken,
    loginCustomerId,
  });

  // searchStream returns array of response objects each with a .results array
  const rows: Array<{
    campaign: { id: string; name: string };
    metrics: { costMicros: string };
    segments: { date: string };
  }> = streamResults.flatMap((chunk: any) => chunk?.results ?? []);

  if (!rows.length) {
    return { ok: true, shop: args.shop, upserted: 0, message: "No campaign data returned" };
  }

  const { db } = await import("~/db.server");
  let upserted = 0;

  for (const row of rows) {
    const campaignId = row.campaign?.id ?? "unknown";
    const campaignName = row.campaign?.name ?? null;
    const spendMicros = Number(row.metrics?.costMicros ?? 0);
    const spend = spendMicros / 1_000_000;
    const dateStr = row.segments?.date;

    if (!dateStr) continue;

    const date = new Date(dateStr + "T00:00:00Z");

    try {
      await (db as any).adSpendDaily.upsert({
        where: {
          shop_platform_date: {
            shop: args.shop,
            platform: "google",
            date,
          },
        },
        update: { spend, campaign: campaignName },
        create: {
          shop: args.shop,
          platform: "google",
          date,
          campaign: campaignName,
          spend,
          adset: null,
          ad: campaignId,
        },
      });
      upserted++;
    } catch (upsertErr: any) {
      // Skip individual row errors (e.g. unique constraint race conditions)
    }
  }

  return { ok: true, shop: args.shop, upserted, total: rows.length };
}

// Backwards compatible alias (some routes still import syncGoogleSpend)
export const syncGoogleSpend = syncGoogleSpendDaily;

/**
 * Syncs per-campaign daily insights (spend + conversions) for the last N days.
 * Upserts into GoogleCampaignDailyInsight table.
 */
export async function syncGoogleCampaignInsights(args: {
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
    accessToken: args.accessToken,
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
    return { ok: true, shop: args.shop, upserted: 0, total: 0 };
  }

  const { db } = await import("~/db.server");
  const anyDb = db as any;
  let upserted = 0;

  for (const row of rows) {
    const campaignId = String(row.campaign?.id ?? "unknown");
    const campaignName = row.campaign?.name ?? null;
    const spend = Number(row.metrics?.costMicros ?? 0) / 1_000_000;
    const impressions = Number(row.metrics?.impressions ?? 0);
    const clicks = Number(row.metrics?.clicks ?? 0);
    const conversions = Number(row.metrics?.conversions ?? 0);
    const conversionValue = Number(row.metrics?.conversionsValue ?? 0);
    const dateStr = row.segments?.date;

    if (!dateStr) continue;

    const date = new Date(dateStr + "T00:00:00Z");

    try {
      await anyDb.googleCampaignDailyInsight.upsert({
        where: {
          google_shop_date_campaignId: {
            shop: args.shop,
            date,
            campaignId,
          },
        },
        create: {
          shop: args.shop,
          date,
          campaignId,
          campaignName,
          spend,
          impressions,
          clicks,
          conversions,
          conversionValue,
        },
        update: {
          campaignName,
          spend,
          impressions,
          clicks,
          conversions,
          conversionValue,
        },
      });
      upserted++;
    } catch (upsertErr: any) {
      // Skip individual row errors (e.g. unique constraint race conditions)
    }
  }

  return { ok: true, shop: args.shop, upserted, total: rows.length };
}
