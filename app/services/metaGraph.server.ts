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
 * Fetch ad accounts available for the user token.
 */
export async function fetchUserAdAccounts(args: { accessToken: string }) {
  const fields = "id,name,account_id,currency,timezone_name,amount_spent,spend_cap";

  // 1. Personal ad accounts
  const personalUrl = new URL("https://graph.facebook.com/v20.0/me/adaccounts");
  personalUrl.searchParams.set("access_token", args.accessToken);
  personalUrl.searchParams.set("fields", fields);
  personalUrl.searchParams.set("limit", "100");

  const personal = await metaFetchJson<{ data: any[]; paging?: any }>(personalUrl.toString(), { method: "GET" });
  const allAccounts = [...(personal?.data || [])];
  const seenIds = new Set(allAccounts.map((a: any) => String(a.id)));

  // 2. Business-owned ad accounts
  try {
    const bizUrl = new URL("https://graph.facebook.com/v20.0/me/businesses");
    bizUrl.searchParams.set("access_token", args.accessToken);
    bizUrl.searchParams.set("fields", "id,name");
    bizUrl.searchParams.set("limit", "50");

    const businesses = await metaFetchJson<{ data: any[] }>(bizUrl.toString(), { method: "GET" });

    // Fetch BOTH owned and client (shared) ad accounts for each business in parallel
    const bizResults = await Promise.allSettled(
      (businesses?.data || []).flatMap((biz: any) => [
        // Owned accounts
        (async () => {
          const u = new URL(`https://graph.facebook.com/v20.0/${biz.id}/owned_ad_accounts`);
          u.searchParams.set("access_token", args.accessToken);
          u.searchParams.set("fields", fields);
          u.searchParams.set("limit", "100");
          const data = await metaFetchJson<{ data: any[] }>(u.toString(), { method: "GET" });
          return { biz, accounts: data?.data || [], type: "owned" };
        })(),
        // Client (shared) accounts
        (async () => {
          const u = new URL(`https://graph.facebook.com/v20.0/${biz.id}/client_ad_accounts`);
          u.searchParams.set("access_token", args.accessToken);
          u.searchParams.set("fields", fields);
          u.searchParams.set("limit", "100");
          const data = await metaFetchJson<{ data: any[] }>(u.toString(), { method: "GET" });
          return { biz, accounts: data?.data || [], type: "client" };
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

  console.log(`[meta] total ad accounts found: ${allAccounts.length} (personal + business)`);
  return { data: allAccounts };
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
