// app/services/metaSync.server.ts
import prisma from "~/db.server";

export type MetaSyncResult = {
  ok: boolean;
  accountId?: string;
  rowsFetched?: number;
  rowsSaved?: number;
  since: string;
  until: string;
  error?: string;
};

function getDateRange(days: number): { since: string; until: string } {
  const now = new Date();
  const until = now.toISOString().slice(0, 10); // YYYY-MM-DD
  const sinceDate = new Date(now);
  sinceDate.setDate(sinceDate.getDate() - days);
  const since = sinceDate.toISOString().slice(0, 10);
  return { since, until };
}

export async function syncMetaAds(
  days: number = 7,
): Promise<MetaSyncResult> {
  const { since, until } = getDateRange(days);

  // 1) Facebook token from FacebookConnection
  const fbConn = await prisma.facebookConnection.findFirst();

  if (!fbConn || !fbConn.accessToken) {
    return {
      ok: false,
      error:
        "Facebook access token not configured (FacebookConnection table is empty).",
      since,
      until,
    };
  }

  // 2) Decide which ad account to use
  //
  // For now we keep it dead simple:
  //   1. FACEBOOK_AD_ACCOUNT_ID env var (highest priority)
  //   2. facebookConnection.accountId (set via /api/facebook/connect)
  //
  let accountIdRaw: string | null = null;

  const envAccount = process.env.FACEBOOK_AD_ACCOUNT_ID;
  console.log("[MetaSync] env FACEBOOK_AD_ACCOUNT_ID =", envAccount);

  if (envAccount && envAccount.trim() !== "") {
    accountIdRaw = envAccount.trim();
  } else {
    const fbConnAny = fbConn as any;
    console.log(
      "[MetaSync] facebookConnection.accountId =",
      fbConnAny?.accountId,
    );
    if (
      fbConnAny &&
      typeof fbConnAny.accountId === "string" &&
      fbConnAny.accountId.trim() !== ""
    ) {
      accountIdRaw = fbConnAny.accountId.trim();
    }
  }

  if (!accountIdRaw) {
    return {
      ok: false,
      error:
        "No Facebook ad account configured. Set env FACEBOOK_AD_ACCOUNT_ID or store accountId on FacebookConnection.",
      since,
      until,
    };
  }

  const accountId = accountIdRaw.startsWith("act_")
    ? accountIdRaw
    : `act_${accountIdRaw}`;

  console.log(
    "[MetaSync] Using ad account id",
    accountIdRaw,
    "=> normalized =>",
    accountId,
  );

  // 3) Call Meta Ads Insights API
  const url = new URL(
    `https://graph.facebook.com/v20.0/${encodeURIComponent(
      accountId,
    )}/insights`,
  );

  const timeRange = JSON.stringify({ since, until });

  url.searchParams.set("time_range", timeRange);
  url.searchParams.set("level", "ad");
  url.searchParams.set("time_increment", "1");
  url.searchParams.set(
    "fields",
    [
      "date_start",
      "campaign_id",
      "adset_id",
      "ad_id",
      "impressions",
      "clicks",
      "spend",
      "actions",
      "action_values",
    ].join(","),
  );
  url.searchParams.set("access_token", fbConn.accessToken);

  let res: Response;
  try {
    res = await fetch(url.toString(), { method: "GET" });
  } catch (err) {
    console.error("Error talking to Meta /insights:", err);
    return {
      ok: false,
      error: "Failed to reach Meta insights API.",
      since,
      until,
    };
  }

  const text = await res.text();
  if (!res.ok) {
    console.error("Meta insights error:", text);
    return {
      ok: false,
      error: `Meta API error ${res.status}: ${text}`,
      since,
      until,
    };
  }

  type InsightRow = {
    date_start: string;
    campaign_id: string;
    adset_id?: string;
    ad_id?: string;
    impressions?: string;
    clicks?: string;
    spend?: string;
    actions?: { action_type: string; value: string }[];
    action_values?: { action_type: string; value: string }[];
  };

  let json: { data?: InsightRow[] };
  try {
    json = JSON.parse(text);
  } catch (err) {
    console.error("Failed to parse Meta insights JSON:", err, text);
    return {
      ok: false,
      error: "Failed to parse Meta insights JSON.",
      since,
      until,
    };
  }

  const rows = json.data ?? [];
  let rowsSaved = 0;

  for (const row of rows) {
    const impressions = row.impressions ? Number(row.impressions) : 0;
    const clicks = row.clicks ? Number(row.clicks) : 0;
    const spend = row.spend ? Number(row.spend) : 0;

    // Conversions & revenue from actions/action_values (purchase)
    let conversions = 0;
    let revenue: number | null = null;

    if (row.actions) {
      const purchaseAction = row.actions.find(
        (a) => a.action_type === "purchase",
      );
      if (purchaseAction) {
        conversions = Number(purchaseAction.value || 0);
      }
    }

    if (row.action_values) {
      const purchaseValue = row.action_values.find(
        (a) => a.action_type === "purchase",
      );
      if (purchaseValue) {
        revenue = Number(purchaseValue.value || 0);
      }
    }

    const date = new Date(row.date_start);

    await prisma.adDailyStat.upsert({
      where: {
        // unique index: [shopId, platform, accountId, campaignId, adId, date]
        shopId_platform_accountId_campaignId_adId_date: {
          shopId: "attribix-com.myshopify.com", // TODO: dynamic later
          platform: "META",
          accountId,
          campaignId: row.campaign_id,
          adId: row.ad_id ?? "",
          date,
        },
      },
      update: {
        impressions,
        clicks,
        spend,
        conversions,
        revenue,
      },
      create: {
        shopId: "attribix-com.myshopify.com",
        platform: "META",
        accountId,
        campaignId: row.campaign_id,
        adsetId: row.adset_id ?? null,
        adId: row.ad_id ?? "",
        date,
        impressions,
        clicks,
        spend,
        conversions,
        revenue,
      },
    });

    rowsSaved += 1;
  }

  return {
    ok: true,
    accountId,
    rowsFetched: rows.length,
    rowsSaved,
    since,
    until,
  };
}
