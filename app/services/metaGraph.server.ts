// app/services/metaGraph.server.ts
const GRAPH_VERSION = "v19.0";

function mustEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

export function getMetaOAuthUrl(state: string) {
  const appId = mustEnv("META_APP_ID");
  const redirectUri = mustEnv("META_REDIRECT_URL");
  const scopes = process.env.META_SCOPES ?? "ads_read,read_insights,business_management";

  const u = new URL(`https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth`);
  u.searchParams.set("client_id", appId);
  u.searchParams.set("redirect_uri", redirectUri);
  u.searchParams.set("state", state);
  u.searchParams.set("scope", scopes);
  u.searchParams.set("response_type", "code");
  return u.toString();
}

async function graphGet(path: string, params: Record<string, string>) {
  const u = new URL(`https://graph.facebook.com/${GRAPH_VERSION}/${path}`);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  const res = await fetch(u.toString());
  const txt = await res.text();
  if (!res.ok) throw new Error(`Meta GET ${path} failed: ${res.status} ${txt}`);
  return JSON.parse(txt);
}

export async function exchangeCodeForShortLivedToken(code: string) {
  const appId = mustEnv("META_APP_ID");
  const secret = mustEnv("META_APP_SECRET");
  const redirectUri = mustEnv("META_REDIRECT_URL");

  return graphGet("oauth/access_token", {
    client_id: appId,
    client_secret: secret,
    redirect_uri: redirectUri,
    code,
  });
}

export async function exchangeForLongLivedToken(shortToken: string) {
  const appId = mustEnv("META_APP_ID");
  const secret = mustEnv("META_APP_SECRET");

  return graphGet("oauth/access_token", {
    grant_type: "fb_exchange_token",
    client_id: appId,
    client_secret: secret,
    fb_exchange_token: shortToken,
  });
}

export async function fetchAdAccounts(accessToken: string) {
  // GET /me/adaccounts
  return graphGet("me/adaccounts", {
    access_token: accessToken,
    fields: "id,name,account_status,currency",
    limit: "100",
  });
}

export async function fetchCampaignDailyInsights(opts: {
  accessToken: string;
  adAccountId: string; // "act_123"
  since: string; // YYYY-MM-DD
  until: string; // YYYY-MM-DD
}) {
  const { accessToken, adAccountId, since, until } = opts;

  // GET /act_xxx/insights
  // We keep fields minimal and stable.
  return graphGet(`${adAccountId}/insights`, {
    access_token: accessToken,
    time_increment: "1",
    level: "campaign",
    time_range: JSON.stringify({ since, until }),
    fields: [
      "date_start",
      "campaign_id",
      "campaign_name",
      "spend",
      "actions",
      "action_values",
    ].join(","),
    limit: "500",
  });
}
