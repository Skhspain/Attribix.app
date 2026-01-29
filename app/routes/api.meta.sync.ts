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

export async function action({ request }: ActionFunctionArgs) {
  const result = await authenticate.admin(request);
  if (result instanceof Response) return result;

  const { session } = result;
  const shop = session.shop;

  const form = await request.formData();
  const days = Number(form.get("days") || "7");

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

  const insights = await fetchCampaignDailyInsights({
    accessToken: conn.accessToken,
    adAccountId: conn.adAccountId,
    since: sinceStr,
    until: untilStr,
  });

  const rows = insights?.data ?? [];

  // Upsert per (shop,date,campaignId)
  for (const r of rows) {
    const date = new Date(r.date_start);
    const spend = Number(r.spend || 0);

    const actions = r.actions || [];
    const values = r.action_values || [];
    const purchase = actions.find((a: any) => a.action_type === "purchase");
    const purchaseValue = values.find((a: any) => a.action_type === "purchase");

    const purchases = purchase ? Number(purchase.value || 0) : 0;
    const purchaseVal = purchaseValue ? Number(purchaseValue.value || 0) : 0;

    await db.metaCampaignDailyInsight.upsert({
      where: {
        shop_date_campaignId: {
          shop,
          date,
          campaignId: String(r.campaign_id),
        },
      },
      create: {
        shop,
        date,
        campaignId: String(r.campaign_id),
        campaignName: r.campaign_name || null,
        spend,
        purchases,
        purchaseValue: purchaseVal,
      },
      update: {
        campaignName: r.campaign_name || null,
        spend,
        purchases,
        purchaseValue: purchaseVal,
      },
    });
  }

  // Recalc AdSpendDaily per date (sum campaigns -> daily spend)
  //
  // IMPORTANT:
  // Your AdSpendDaily model (per your schema) is:
  //   (date, platform, campaign?, adset?, ad?, spend)
  // It does NOT have `shop`, and it does NOT have a unique key `shop_date`.
  //
  // So we store one aggregate row per day for platform="meta" with campaign/adset/ad = null,
  // by deleting any existing aggregate row for that date and inserting a fresh one.
  const byDate = new Map<string, number>();
  for (const r of rows) {
    const k = String(r.date_start);
    byDate.set(k, (byDate.get(k) || 0) + Number(r.spend || 0));
  }

  for (const [k, v] of byDate.entries()) {
    const date = new Date(k);

    await db.adSpendDaily.deleteMany({
      where: {
        date,
        platform: "meta",
        campaign: null,
        adset: null,
        ad: null,
      },
    });

    await db.adSpendDaily.create({
      data: {
        date,
        platform: "meta",
        campaign: null,
        adset: null,
        ad: null,
        spend: v,
      },
    });
  }

  return json({ ok: true, days, rows: rows.length });
}
