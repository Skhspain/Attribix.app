// app/services/campaignNames.server.ts
// Meta ad links usually carry utm_campaign={{campaign.id}}, so orders store a
// numeric campaign id. For display we swap in the campaign's name from the
// synced Meta insights. utmCampaign itself stays the id (matching uses it).

import db from "~/db.server";
import { visitSeen } from "~/utils/orderSource";

const META_ID = /^\d{12,20}$/;

export async function metaCampaignNames(shop: string, values: Array<string | null | undefined>) {
  const ids = [...new Set(values.filter((v): v is string => !!v && META_ID.test(v.trim())).map((v) => v.trim()))];
  const names = new Map<string, string>();
  if (!ids.length) return names;

  const rows = await (db as any).metaCampaignDailyInsight
    .findMany({
      where: { shop, campaignId: { in: ids }, campaignName: { not: null } },
      select: { campaignId: true, campaignName: true, date: true },
      orderBy: { date: "desc" },
    })
    .catch(() => []);
  // Newest name wins if a campaign was renamed.
  for (const r of rows as any[]) if (!names.has(r.campaignId)) names.set(r.campaignId, r.campaignName);
  return names;
}

/**
 * Adds campaignLabel (readable campaign) and tracked (did we see the visit at
 * all?) to each order. An order we never saw a visit for isn't "direct" — the
 * buyer most likely declined cookies, so no browser tracking ran.
 */
export async function labelOrders<T extends Record<string, any>>(shop: string, orders: T[]) {
  const names = await metaCampaignNames(shop, orders.map((o) => o.utmCampaign));
  return orders.map((o) => ({
    ...o,
    campaignLabel: o.utmCampaign ? names.get(String(o.utmCampaign).trim()) ?? o.utmCampaign : null,
    tracked: visitSeen(o),
  }));
}
