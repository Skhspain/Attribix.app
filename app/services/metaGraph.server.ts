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
  const url = new URL("https://graph.facebook.com/v20.0/me/adaccounts");
  url.searchParams.set("access_token", args.accessToken);
  url.searchParams.set("fields", "id,name,account_id,currency,timezone_name,amount_spent,spend_cap");

  return metaFetchJson<{ data: any[]; paging?: any }>(url.toString(), { method: "GET" });
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
  if (args.level) url.searchParams.set("level", args.level);

  console.log(`[metaGraph] fetchInsights level=${args.level} id=${id} since=${args.since} until=${args.until}`);
  const result = await metaFetchJson<{ data: any[]; paging?: any }>(url.toString(), { method: "GET" });
  console.log(`[metaGraph] response rows=${result?.data?.length ?? 0}`);
  return result;
}
