import db from "~/db.server";

type GoogleTokenRow = {
  accessToken: string;
  refreshToken?: string | null;
  expiresAt?: Date | null;
  adCustomerId?: string | null;
};

function required(name: string, value?: string) {
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

async function getGoogleConnection(shop: string): Promise<GoogleTokenRow> {
  const row = await db.googleConnection.findUnique({ where: { shop } });
  if (!row) throw new Error(`No Google connection for shop: ${shop}`);
  if (!row.accessToken) throw new Error("Missing Google access token");
  return row;
}

/**
 * Refresh access token if expired (or missing expiresAt) — uses refresh_token.
 * You already store refreshToken in GoogleConnection.
 */
export async function getValidGoogleAccessToken(shop: string) {
  const clientId = required("GOOGLE_CLIENT_ID", process.env.GOOGLE_CLIENT_ID);
  const clientSecret = required("GOOGLE_CLIENT_SECRET", process.env.GOOGLE_CLIENT_SECRET);

  const conn = await getGoogleConnection(shop);

  // If expiresAt exists and is still valid for 60s margin — reuse token
  if (conn.expiresAt && conn.expiresAt.getTime() > Date.now() + 60_000) {
    return { accessToken: conn.accessToken, conn };
  }

  // If no refresh token, we can't refresh — force reconnect
  if (!conn.refreshToken) {
    return { accessToken: conn.accessToken, conn };
  }

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: conn.refreshToken,
      grant_type: "refresh_token",
    }),
  });

  const json = await tokenRes.json();
  if (!tokenRes.ok) {
    throw new Error(`Google token refresh failed: ${JSON.stringify(json)}`);
  }

  const newAccessToken = json.access_token as string;
  const expiresIn = typeof json.expires_in === "number" ? json.expires_in : null;
  const expiresAt = expiresIn ? new Date(Date.now() + expiresIn * 1000) : null;

  await db.googleConnection.update({
    where: { shop },
    data: {
      accessToken: newAccessToken,
      expiresAt: expiresAt ?? undefined,
      // refresh_token usually not returned on refresh
    },
  });

  return {
    accessToken: newAccessToken,
    conn: { ...conn, accessToken: newAccessToken, expiresAt },
  };
}

/**
 * Lists accessible customers for this authenticated user:
 * GET https://googleads.googleapis.com/v18/customers:listAccessibleCustomers
 */
export async function listAccessibleCustomers(shop: string) {
  const developerToken = required("GOOGLE_ADS_DEVELOPER_TOKEN", process.env.GOOGLE_ADS_DEVELOPER_TOKEN);
  const { accessToken } = await getValidGoogleAccessToken(shop);

  const res = await fetch("https://googleads.googleapis.com/v18/customers:listAccessibleCustomers", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "developer-token": developerToken,
    },
  });

  const json = await res.json();
  if (!res.ok) throw new Error(`listAccessibleCustomers failed: ${JSON.stringify(json)}`);

  const resourceNames: string[] = json.resourceNames || [];
  // resource name format: "customers/1234567890"
  const customerIds = resourceNames
    .map((r) => r.split("/")[1])
    .filter(Boolean);

  return customerIds;
}

/**
 * Sync spend into AdSpendDaily (platform = "google") for last N days.
 *
 * Uses Google Ads SearchStream:
 * POST https://googleads.googleapis.com/v18/customers/{customerId}/googleAds:searchStream
 */
export async function syncGoogleSpendDaily(shop: string, days: number) {
  const developerToken = required("GOOGLE_ADS_DEVELOPER_TOKEN", process.env.GOOGLE_ADS_DEVELOPER_TOKEN);
  const loginCustomerId = process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID; // optional
  const { accessToken, conn } = await getValidGoogleAccessToken(shop);

  const customerId = conn.adCustomerId;
  if (!customerId) throw new Error("No Google adCustomerId selected yet");

  // GAQL: daily cost micros by date + campaign
  // segments.date is YYYY-MM-DD
  const gaql = `
    SELECT
      segments.date,
      campaign.id,
      campaign.name,
      metrics.cost_micros
    FROM campaign
    WHERE segments.date DURING LAST_${days}_DAYS
  `.trim();

  const url = `https://googleads.googleapis.com/v18/customers/${customerId}/googleAds:searchStream`;

  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    "developer-token": developerToken,
    "content-type": "application/json",
  };
  if (loginCustomerId) headers["login-customer-id"] = loginCustomerId;

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({ query: gaql }),
  });

  const json = await res.json();
  if (!res.ok) throw new Error(`googleAds:searchStream failed: ${JSON.stringify(json)}`);

  // searchStream returns an array of response chunks
  // each chunk has results[]
  const rows: Array<{
    date: string;
    campaignName?: string;
    costMicros: number;
  }> = [];

  for (const chunk of json || []) {
    for (const r of chunk.results || []) {
      const date = r.segments?.date;
      const campaignName = r.campaign?.name;
      const costMicros = Number(r.metrics?.costMicros ?? r.metrics?.cost_micros ?? 0);
      if (!date) continue;
      rows.push({ date, campaignName, costMicros });
    }
  }

  // Aggregate (date + campaign) in case of duplicates
  const keyMap = new Map<string, { date: string; campaign?: string; spend: number }>();
  for (const r of rows) {
    const key = `${r.date}::${r.campaignName || ""}`;
    const spend = (r.costMicros || 0) / 1_000_000;
    const prev = keyMap.get(key);
    if (prev) prev.spend += spend;
    else keyMap.set(key, { date: r.date, campaign: r.campaignName || undefined, spend });
  }

  const upserts = Array.from(keyMap.values());

  // Store into AdSpendDaily (platform + date + campaign are not unique in your schema)
  // We'll do "delete then insert" for the date range, simple MVP.
  const dates = upserts.map((u) => u.date).sort();
  const minDate = dates[0];
  const maxDate = dates[dates.length - 1];

  if (!minDate || !maxDate) {
    return { inserted: 0, range: null };
  }

  // Delete existing google spend rows in this date range
  await db.adSpendDaily.deleteMany({
    where: {
      platform: "google",
      date: {
        gte: new Date(minDate + "T00:00:00.000Z"),
        lte: new Date(maxDate + "T23:59:59.999Z"),
      },
    },
  });

  // Insert new
  await db.adSpendDaily.createMany({
    data: upserts.map((u) => ({
      date: new Date(u.date + "T00:00:00.000Z"),
      platform: "google",
      campaign: u.campaign,
      spend: u.spend,
    })),
  });

  return { inserted: upserts.length, range: { minDate, maxDate } };
}
