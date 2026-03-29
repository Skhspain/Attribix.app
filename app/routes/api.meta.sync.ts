// app/routes/api.meta.sync.ts
import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { authenticate } from "~/shopify.server";
import db from "~/db.server";
import { fetchCampaignDailyInsights } from "~/services/metaGraph.server";

function formatDay(d: Date) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function getPurchaseStats(row: any) {
  const actions = row.actions || [];
  const values = row.action_values || [];
  const purchaseAction = actions.find((a: any) => a.action_type === "purchase");
  const purchaseValue = values.find((a: any) => a.action_type === "purchase");
  return {
    purchases: purchaseAction ? Number(purchaseAction.value || 0) : 0,
    purchaseValue: purchaseValue ? Number(purchaseValue.value || 0) : 0,
  };
}

export async function action({ request }: ActionFunctionArgs) {
  const result = await authenticate.admin(request);
  if (result instanceof Response) return result;

  const { session } = result;
  const shop = session.shop;

  const form = await request.formData();
  const days = Number(form.get("days") || "30");

  const conn = await db.metaConnection.findUnique({ where: { shop } });
  if (!conn || !conn.accessToken || conn.accessToken === "__PENDING__") {
    return json({ ok: false, error: "Meta not connected" }, { status: 400 });
  }
  if (!conn.adAccountId) {
    return json({ ok: false, error: "No ad account selected" }, { status: 400 });
  }

  const until = new Date();
  const since = new Date();
  since.setDate(until.getDate() - (days - 1));

  const sinceStr = formatDay(since);
  const untilStr = formatDay(until);

  const anyDb = db as any;

  // ── 1. Campaign-level sync ────────────────────────────────────────────────
  const campaignInsights = await fetchCampaignDailyInsights({
    accessToken: conn.accessToken,
    adAccountId: conn.adAccountId,
    since: sinceStr,
    until: untilStr,
    level: "campaign",
  });

  const campaignRows = campaignInsights?.data ?? [];

  for (const r of campaignRows) {
    const date = new Date(r.date_start);
    const spend = Number(r.spend || 0);
    const impressions = Number(r.impressions || 0);
    const clicks = Number(r.clicks || 0);
    const ctr = Number(r.ctr || 0);
    const cpc = Number(r.cpc || 0);
    const { purchases, purchaseValue } = getPurchaseStats(r);

    await db.metaCampaignDailyInsight.upsert({
      where: { shop_date_campaignId: { shop, date, campaignId: String(r.campaign_id) } },
      create: {
        shop, date,
        campaignId: String(r.campaign_id),
        campaignName: r.campaign_name || null,
        spend, impressions, clicks, purchases, purchaseValue,
      },
      update: {
        campaignName: r.campaign_name || null,
        spend, impressions, clicks, purchases, purchaseValue,
      },
    });
  }

  // ── 2. Ad-level sync ──────────────────────────────────────────────────────
  const adInsights = await fetchCampaignDailyInsights({
    accessToken: conn.accessToken,
    adAccountId: conn.adAccountId,
    since: sinceStr,
    until: untilStr,
    level: "ad",
  });

  const adRows = adInsights?.data ?? [];

  for (const r of adRows) {
    const date = new Date(r.date_start);
    const spend = Number(r.spend || 0);
    const impressions = Number(r.impressions || 0);
    const clicks = Number(r.clicks || 0);
    const ctr = Number(r.ctr || 0);
    const cpc = Number(r.cpc || 0);
    const { purchases, purchaseValue } = getPurchaseStats(r);

    await anyDb.metaAdDailyInsight.upsert({
      where: { shop_date_adId: { shop, date, adId: String(r.ad_id) } },
      create: {
        shop, date,
        campaignId: String(r.campaign_id),
        campaignName: r.campaign_name || null,
        adSetId: String(r.adset_id || ""),
        adSetName: r.adset_name || null,
        adId: String(r.ad_id),
        adName: r.ad_name || null,
        spend, impressions, clicks, ctr, cpc, purchases, purchaseValue,
      },
      update: {
        campaignName: r.campaign_name || null,
        adSetName: r.adset_name || null,
        adName: r.ad_name || null,
        spend, impressions, clicks, ctr, cpc, purchases, purchaseValue,
      },
    });
  }

  // ── 3. AdSpendDaily aggregate (per shop+platform+date) ───────────────────
  const byDate = new Map<string, number>();
  for (const r of campaignRows) {
    const k = String(r.date_start);
    byDate.set(k, (byDate.get(k) || 0) + Number(r.spend || 0));
  }

  for (const [k, v] of byDate.entries()) {
    const date = new Date(k);
    await anyDb.adSpendDaily.upsert({
      where: { shop_platform_date: { shop, platform: "meta", date } },
      create: { shop, date, platform: "meta", campaign: null, adset: null, ad: null, spend: v },
      update: { spend: v },
    });
  }

  return json({ ok: true, days, campaignRows: campaignRows.length, adRows: adRows.length });
}
