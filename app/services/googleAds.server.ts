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
 * Otherwise keep it as a safe placeholder that doesn't break builds.
 */
export async function syncGoogleSpendDaily(args: {
  shop: string;
  accessToken: string;
  customerId: string;
}) {
  // TODO: implement real spend query (GAQL) and persistence.
  // For now: return a consistent result so UI/actions can proceed without crashing.
  return {
    ok: true,
    shop: args.shop,
    customerId: args.customerId,
    message: "syncGoogleSpendDaily placeholder (not implemented yet)",
  };
}

// Backwards compatible alias (some routes still import syncGoogleSpend)
export const syncGoogleSpend = syncGoogleSpendDaily;
