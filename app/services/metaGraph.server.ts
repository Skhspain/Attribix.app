// app/services/metaGraph.server.ts

type MetaTokenResponse = {
  access_token: string;
  token_type?: string;
  expires_in?: number;
};

type MetaApiError = {
  error?: {
    message?: string;
    type?: string;
    code?: number;
    error_subcode?: number;
    fbtrace_id?: string;
  };
};

async function metaFetchJson<T>(
  url: string,
  init?: RequestInit
): Promise<T> {
  const res = await fetch(url, init);
  const text = await res.text();

  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    // not json
  }

  if (!res.ok) {
    const errMsg =
      (json as MetaApiError | null)?.error?.message ||
      text ||
      `Meta request failed (${res.status})`;
    throw new Response(errMsg, { status: 500 });
  }

  return json as T;
}

/**
 * Exchange OAuth code for access token
 * https://developers.facebook.com/docs/facebook-login/guides/access-tokens/getting-started/
 */
export async function exchangeMetaCodeForToken(args: {
  code: string;
  redirectUri: string;
}) {
  const clientId = process.env.META_APP_ID;
  const clientSecret = process.env.META_APP_SECRET;

  if (!clientId) throw new Response("Missing META_APP_ID", { status: 500 });
  if (!clientSecret) throw new Response("Missing META_APP_SECRET", { status: 500 });

  const url = new URL("https://graph.facebook.com/v20.0/oauth/access_token");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("client_secret", clientSecret);
  url.searchParams.set("redirect_uri", args.redirectUri);
  url.searchParams.set("code", args.code);

  return metaFetchJson<MetaTokenResponse>(url.toString(), { method: "GET" });
}

/**
 * Fetch all pages from a Meta Graph API endpoint that uses cursor pagination.
 */
async function fetchAllPages(startUrl: string, maxPages: number = 20): Promise<any[]> {
  const all: any[] = [];
  let next: string | null = startUrl;
  let page = 0;
  while (next && page < maxPages) {
    const data: any = await metaFetchJson<{ data: any[]; paging?: any }>(next, { method: "GET" }).catch(() => null);
    if (!data) break;
    if (Array.isArray(data.data)) all.push(...data.data);
    next = data?.paging?.next || null;
    page++;
  }
  return all;
}

/**
 * Fetch ad accounts available for the user token.
 * Queries personal + business-owned + client-shared, all with pagination.
 */
export async function fetchUserAdAccounts(args: { accessToken: string }) {
  const fields = "id,name,account_id,currency,timezone_name,amount_spent,spend_cap";

  // 1. Personal ad accounts (all pages)
  const personalUrl = new URL("https://graph.facebook.com/v20.0/me/adaccounts");
  personalUrl.searchParams.set("access_token", args.accessToken);
  personalUrl.searchParams.set("fields", fields);
  personalUrl.searchParams.set("limit", "100");

  const personalAccounts = await fetchAllPages(personalUrl.toString());
  const allAccounts = [...personalAccounts];
  const seenIds = new Set(allAccounts.map((a: any) => String(a.id)));

  // 2. Business-owned + client ad accounts (all pages per business)
  try {
    const bizUrl = new URL("https://graph.facebook.com/v20.0/me/businesses");
    bizUrl.searchParams.set("access_token", args.accessToken);
    bizUrl.searchParams.set("fields", "id,name");
    bizUrl.searchParams.set("limit", "100");

    const businesses = await fetchAllPages(bizUrl.toString());

    const bizResults = await Promise.allSettled(
      businesses.flatMap((biz: any) => [
        // Owned accounts (paginated)
        (async () => {
          const u = new URL(`https://graph.facebook.com/v20.0/${biz.id}/owned_ad_accounts`);
          u.searchParams.set("access_token", args.accessToken);
          u.searchParams.set("fields", fields);
          u.searchParams.set("limit", "100");
          const accounts = await fetchAllPages(u.toString());
          return { biz, accounts, type: "owned" };
        })(),
        // Client (shared) accounts (paginated)
        (async () => {
          const u = new URL(`https://graph.facebook.com/v20.0/${biz.id}/client_ad_accounts`);
          u.searchParams.set("access_token", args.accessToken);
          u.searchParams.set("fields", fields);
          u.searchParams.set("limit", "100");
          const accounts = await fetchAllPages(u.toString());
          return { biz, accounts, type: "client" };
        })(),
      ])
    );

    for (const result of bizResults) {
      if (result.status === "fulfilled") {
        for (const acc of result.value.accounts) {
          if (!seenIds.has(String(acc.id))) {
            allAccounts.push({ ...acc, name: acc.name || `${result.value.biz.name} (${acc.id})` });
            seenIds.add(String(acc.id));
          }
        }
      } else {
        console.error(`[meta] failed to fetch business accounts:`, result.reason?.message);
      }
    }
  } catch (e) {
    console.error("[meta] failed to fetch businesses:", (e as any)?.message);
  }

  console.log(`[meta] total ad accounts found: ${allAccounts.length} (personal + business + client)`);
  return { data: allAccounts };
}

/**
 * Fetch the single best pixel for an ad account.
 *
 * Strategy (in order):
 *  1. Business-owned pixels via /me/businesses → owned_pixels
 *     These are pixels the merchant OWNS in their Business Manager.
 *     This avoids third-party app pixels (e.g. PBA Pixel) that share the ad
 *     account but were created by another app, not the store owner.
 *  2. Fallback: /{adAccountId}/adspixels — all pixels connected to the account.
 */
export async function fetchBestPixel(args: {
  accessToken: string;
  adAccountId: string;
}): Promise<{ id: string; name: string } | null> {
  // Try 1: business-owned pixels
  try {
    const bizRes = await fetch(
      `https://graph.facebook.com/v20.0/me/businesses?fields=owned_pixels{id,name}&access_token=${args.accessToken}`
    );
    const bizData = await bizRes.json() as any;
    const bizPixels: Array<{ id: string; name: string }> = (bizData?.data || [])
      .flatMap((b: any) => b.owned_pixels?.data || []);
    if (bizPixels[0]?.id) {
      console.log(`[meta/fetchBestPixel] using business-owned pixel: ${bizPixels[0].name} (${bizPixels[0].id})`);
      return { id: bizPixels[0].id, name: bizPixels[0].name };
    }
  } catch (e: any) {
    console.error("[meta/fetchBestPixel] business pixel lookup failed:", e?.message);
  }

  // Try 2: adspixels fallback
  try {
    const actId = args.adAccountId.startsWith("act_") ? args.adAccountId : `act_${args.adAccountId}`;
    const pixRes = await fetch(
      `https://graph.facebook.com/v20.0/${actId}/adspixels?fields=id,name&access_token=${args.accessToken}`
    );
    const pixData = await pixRes.json() as any;
    if (pixData?.data?.[0]?.id) {
      console.log(`[meta/fetchBestPixel] fallback adspixels: ${pixData.data[0].name} (${pixData.data[0].id})`);
      return { id: pixData.data[0].id, name: pixData.data[0].name };
    }
  } catch (e: any) {
    console.error("[meta/fetchBestPixel] adspixels fallback failed:", e?.message);
  }

  return null;
}

/**
 * Fetch all available pixels, business-owned ones first so the merchant's
 * store pixel surfaces at the top of any selection UI.
 */
export async function fetchAllPixels(args: {
  accessToken: string;
  adAccountId: string;
}): Promise<Array<{ id: string; name: string }>> {
  const all: Array<{ id: string; name: string }> = [];
  const seenIds = new Set<string>();

  // Business-owned pixels first (de-duplicated)
  try {
    const bizRes = await fetch(
      `https://graph.facebook.com/v20.0/me/businesses?fields=owned_pixels{id,name}&access_token=${args.accessToken}`
    );
    const bizData = await bizRes.json() as any;
    const bizPixels: Array<{ id: string; name: string }> = (bizData?.data || [])
      .flatMap((b: any) => b.owned_pixels?.data || []);
    for (const p of bizPixels) {
      if (p.id && !seenIds.has(p.id)) {
        all.push({ id: p.id, name: p.name });
        seenIds.add(p.id);
      }
    }
  } catch {}

  // Then any ad-account pixels not already included
  try {
    const actId = args.adAccountId.startsWith("act_") ? args.adAccountId : `act_${args.adAccountId}`;
    const pixRes = await fetch(
      `https://graph.facebook.com/v20.0/${actId}/adspixels?fields=id,name&access_token=${args.accessToken}`
    );
    const pixData = await pixRes.json() as any;
    for (const p of (pixData?.data || [])) {
      if (p.id && !seenIds.has(p.id)) {
        all.push({ id: p.id, name: p.name || p.id });
        seenIds.add(p.id);
      }
    }
  } catch {}

  return all;
}

/**
 * Create a new Meta Pixel in an ad account.
 */
export async function createMetaPixel(args: { accessToken: string; adAccountId: string; name: string }) {
  const url = `https://graph.facebook.com/v20.0/${args.adAccountId}/adspixels`;
  const body = new URLSearchParams();
  body.set("name", args.name);
  body.set("access_token", args.accessToken);

  const res = await fetch(url, { method: "POST", body });
  const data: any = await res.json();
  if (data?.error) {
    throw new Error(data.error.message || "Failed to create pixel");
  }
  return data;
}

/**
 * Daily insights for either:
 *  - Ad Account: /{act_XXXX}/insights
 *  - Campaign: /{campaignId}/insights
 *
 * We accept BOTH adAccountId and campaignId so your route won't type-error.
 */
const CAMPAIGN_FIELDS = [
  "date_start", "date_stop",
  "campaign_id", "campaign_name",
  "impressions", "clicks", "spend", "cpm", "cpc", "ctr",
  "actions", "action_values", "purchase_roas",
];

const AD_FIELDS = [
  "date_start", "date_stop",
  "campaign_id", "campaign_name",
  "adset_id", "adset_name",
  "ad_id", "ad_name",
  "impressions", "clicks", "spend", "cpm", "cpc", "ctr",
  "actions", "action_values",
];

/**
 * Fetch campaign objectives for all campaigns in an ad account.
 * Returns a Map of campaignId → objective string.
 */
export async function fetchCampaignObjectives(args: {
  accessToken: string;
  adAccountId: string;
}): Promise<Map<string, string>> {
  const url = new URL(`https://graph.facebook.com/v20.0/${encodeURIComponent(args.adAccountId)}/campaigns`);
  url.searchParams.set("access_token", args.accessToken);
  url.searchParams.set("fields", "id,name,objective");
  url.searchParams.set("limit", "200");

  const result = await metaFetchJson<{ data: Array<{ id: string; name: string; objective: string }> }>(
    url.toString(), { method: "GET" }
  );

  const map = new Map<string, string>();
  for (const c of result?.data ?? []) {
    if (c.id && c.objective) map.set(String(c.id), c.objective);
  }
  return map;
}

export async function fetchCampaignDailyInsights(args: {
  accessToken: string;
  adAccountId?: string;
  campaignId?: string;
  since: string;
  until: string;
  level?: "campaign" | "adset" | "ad";
  fields?: string[];
}) {
  const id = args.campaignId ?? args.adAccountId;
  if (!id) throw new Response("Missing campaignId or adAccountId", { status: 400 });

  const fields = args.fields?.length ? args.fields
    : args.level === "ad" ? AD_FIELDS
    : CAMPAIGN_FIELDS;

  const url = new URL(`https://graph.facebook.com/v20.0/${encodeURIComponent(id)}/insights`);
  url.searchParams.set("access_token", args.accessToken);
  url.searchParams.set("fields", fields.join(","));
  url.searchParams.set("time_increment", "1");
  url.searchParams.set("time_range", JSON.stringify({ since: args.since, until: args.until }));
  url.searchParams.set("limit", "500"); // max per page to minimise round-trips
  if (args.level) url.searchParams.set("level", args.level);

  console.log(`[metaGraph] fetchInsights level=${args.level} id=${id} since=${args.since} until=${args.until}`);

  // Collect all pages — Meta paginates even with limit=500 when many rows exist
  const allRows: any[] = [];
  let nextUrl: string | null = url.toString();

  while (nextUrl) {
    const page = await metaFetchJson<{ data: any[]; paging?: { next?: string } }>(nextUrl, { method: "GET" });
    const rows = page?.data ?? [];
    allRows.push(...rows);
    // Follow cursor if there are more pages
    nextUrl = page?.paging?.next ?? null;
    if (nextUrl) {
      console.log(`[metaGraph] fetching next page (${allRows.length} rows so far)…`);
    }
  }

  console.log(`[metaGraph] total rows fetched=${allRows.length}`);
  return { data: allRows };
}
