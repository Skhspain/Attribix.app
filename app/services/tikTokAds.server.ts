// TikTok Marketing API client
// Docs: https://business-api.tiktok.com/portal/docs

const TIKTOK_BASE = "https://business-api.tiktok.com/open_api/v1.3";

export interface TikTokTokenResult {
  access_token: string;
  advertiser_ids: string[];
}

export interface TikTokAdvertiser {
  advertiser_id: string;
  advertiser_name: string;
  currency: string;
  timezone: string;
}

export interface TikTokCampaignReport {
  dimensions: { campaign_id: string; stat_time_day: string };
  metrics: {
    campaign_name: string;
    spend: string;
    impressions: string;
    clicks: string;
    conversion: string;
    total_complete_payment: string;
    total_complete_payment_value: string;
  };
}

export interface TikTokAdReport {
  dimensions: { ad_id: string; stat_time_day: string };
  metrics: {
    campaign_id: string;
    campaign_name: string;
    adgroup_id: string;
    adgroup_name: string;
    ad_name: string;
    spend: string;
    impressions: string;
    clicks: string;
    conversion: string;
    total_complete_payment: string;
    total_complete_payment_value: string;
  };
}

// Exchange auth code for access token
export async function exchangeTikTokCodeForToken(
  authCode: string
): Promise<TikTokTokenResult> {
  const appId = process.env.TIKTOK_APP_ID!;
  const appSecret = process.env.TIKTOK_APP_SECRET!;

  const res = await fetch(`${TIKTOK_BASE}/oauth2/access_token/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      app_id: appId,
      secret: appSecret,
      auth_code: authCode,
    }),
  });

  const json = await res.json();
  if (json.code !== 0) {
    throw new Error(`TikTok token error: ${json.message || JSON.stringify(json)}`);
  }

  return {
    access_token: json.data.access_token,
    advertiser_ids: json.data.advertiser_ids || [],
  };
}

// Get advertiser accounts
export async function fetchTikTokAdvertisers(
  accessToken: string
): Promise<TikTokAdvertiser[]> {
  const appId = process.env.TIKTOK_APP_ID!;

  const res = await fetch(
    `${TIKTOK_BASE}/oauth2/advertiser/get/?app_id=${appId}&secret=${process.env.TIKTOK_APP_SECRET}`,
    {
      headers: { "Access-Token": accessToken },
    }
  );

  const json = await res.json();
  if (json.code !== 0) {
    console.error("[tiktok] advertiser fetch error:", json);
    return [];
  }

  return (json.data?.list || []).map((a: any) => ({
    advertiser_id: a.advertiser_id,
    advertiser_name: a.advertiser_name,
    currency: a.currency,
    timezone: a.timezone,
  }));
}

// Fetch campaign-level reports
export async function fetchTikTokCampaignInsights(
  accessToken: string,
  advertiserId: string,
  startDate: string, // YYYY-MM-DD
  endDate: string
): Promise<TikTokCampaignReport[]> {
  const body = {
    advertiser_id: advertiserId,
    report_type: "BASIC",
    dimensions: ["campaign_id", "stat_time_day"],
    data_level: "AUCTION_CAMPAIGN",
    metrics: [
      "campaign_name", "spend", "impressions", "clicks",
      "conversion", "total_complete_payment", "total_complete_payment_value",
    ],
    start_date: startDate,
    end_date: endDate,
    page: 1,
    page_size: 1000,
  };

  const allRows: TikTokCampaignReport[] = [];
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    body.page = page;
    const res = await fetch(`${TIKTOK_BASE}/report/integrated/get/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Access-Token": accessToken,
      },
      body: JSON.stringify(body),
    });

    const json = await res.json();
    if (json.code !== 0) {
      console.error("[tiktok] campaign insights error:", json.message);
      break;
    }

    const rows = json.data?.list || [];
    allRows.push(...rows);

    const total = json.data?.page_info?.total_number || 0;
    hasMore = allRows.length < total;
    page++;
  }

  return allRows;
}

// Fetch ad-level reports
export async function fetchTikTokAdInsights(
  accessToken: string,
  advertiserId: string,
  startDate: string,
  endDate: string
): Promise<TikTokAdReport[]> {
  const body = {
    advertiser_id: advertiserId,
    report_type: "BASIC",
    dimensions: ["ad_id", "stat_time_day"],
    data_level: "AUCTION_AD",
    metrics: [
      "campaign_id", "campaign_name", "adgroup_id", "adgroup_name",
      "ad_name", "spend", "impressions", "clicks",
      "conversion", "total_complete_payment", "total_complete_payment_value",
    ],
    start_date: startDate,
    end_date: endDate,
    page: 1,
    page_size: 1000,
  };

  const allRows: TikTokAdReport[] = [];
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    body.page = page;
    const res = await fetch(`${TIKTOK_BASE}/report/integrated/get/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Access-Token": accessToken,
      },
      body: JSON.stringify(body),
    });

    const json = await res.json();
    if (json.code !== 0) {
      console.error("[tiktok] ad insights error:", json.message);
      break;
    }

    const rows = json.data?.list || [];
    allRows.push(...rows);

    const total = json.data?.page_info?.total_number || 0;
    hasMore = allRows.length < total;
    page++;
  }

  return allRows;
}
