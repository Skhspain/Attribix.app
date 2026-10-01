// app/utils/overviewActions.ts
// The rules behind "What to do next" on Overview. Each rule needs a minimum
// amount of data before it fires and explains itself in `why`, so a card is
// never a guess. ROAS is sales ÷ spend, never profit, and the cards say so.
import { formatRoas } from "./roas";

export type ActionKind = "fix" | "grow" | "data" | "tool";

export type OverviewAction = {
  id: string;
  /** Changes when the underlying numbers change, so a dismissed card can return. */
  signature: string;
  kind: ActionKind;
  chip: string;
  title: string;
  body: string;
  why: string;
  cta: { label: string; url: string };
};

export type CampaignDay = {
  campaignId: string; campaignName: string | null; date: string | Date;
  spend: number; clicks: number; purchases: number; value: number;
};

export type ActionInputs = {
  periodDays: number;
  currency: string;
  orders: number;
  revenue: number;
  pixelStatus: "healthy" | "warning" | "error" | "never";
  metaConnected: boolean;
  googleConnected: boolean;
  googleSyncError: string | null;
  tracking: { onlineOrders: number; onlineAttributed: number; notTrackedOrders: number; directOrders: number };
  /** Meta campaign insights for the report period, spend/value in store currency. */
  metaCampaignDays: CampaignDay[];
  /** The same for the last 21 days, used to judge whether results are steady. */
  metaCampaignDays21: CampaignDay[];
  /** Orders and revenue per source bucket (see utils/orderSource). */
  sources: Array<{ source: string; orders: number; revenue: number }>;
  tools: { newsletterCampaignsSent: number; totalReviews: number };
};

// Default target until merchants can set one on the server (Meta Ads keeps its
// target in the browser only).
const TARGET_ROAS = 3;

const money = (v: number, currency: string) => {
  try { return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(v); }
  catch { return String(Math.round(v)); }
};

function byCampaign(rows: CampaignDay[]) {
  const map = new Map<string, { id: string; name: string; spend: number; clicks: number; purchases: number; value: number }>();
  for (const r of rows) {
    const cur = map.get(r.campaignId) ?? { id: r.campaignId, name: r.campaignName || r.campaignId, spend: 0, clicks: 0, purchases: 0, value: 0 };
    cur.spend += r.spend; cur.clicks += r.clicks; cur.purchases += r.purchases; cur.value += r.value;
    map.set(r.campaignId, cur);
  }
  return [...map.values()];
}

export function buildOverviewActions(i: ActionInputs): OverviewAction[] {
  const out: OverviewAction[] = [];
  const period = `the last ${i.periodDays} days`;

  // ── Setup problems first: every other number depends on them.
  if (i.pixelStatus !== "healthy") {
    out.push({
      id: "pixel", signature: i.pixelStatus, kind: "fix", chip: "Fix",
      title: i.pixelStatus === "never" ? "Attribix hasn't seen any visits to your store yet" : "Attribix hasn't seen visits to your store in the last 24 hours",
      body: "Without visits, orders can't be linked to the ad or channel that brought the customer in. Check that the Attribix app embed is turned on in your theme.",
      why: "Shown when no storefront events have arrived in the last 24 hours.",
      cta: { label: "Check tracking", url: "/app/setup" },
    });
  }
  if (i.googleConnected && i.googleSyncError) {
    out.push({
      id: "google-sync", signature: i.googleSyncError.slice(0, 40), kind: "fix", chip: "Fix",
      title: "Google Ads data isn't syncing",
      body: `Google spend is missing, so ROAS on this page is likely too high. Google said: ${i.googleSyncError}`,
      why: "Shown when the last Google Ads sync returned an error.",
      cta: { label: "View Google connection", url: "/app/integrations/google" },
    });
  }
  if (!i.metaConnected) {
    out.push({
      id: "connect-meta", signature: "1", kind: "data", chip: "Set up",
      title: "Connect Meta Ads to see what your Facebook and Instagram ads bring in",
      body: "Attribix brings in your spend and compares it with the orders it tracked, so you can see your return on each campaign.",
      why: "Shown until a Meta ad account is connected.",
      cta: { label: "Connect Meta", url: "/app/integrations/meta" },
    });
  } else if (!i.googleConnected) {
    out.push({
      id: "connect-google", signature: "1", kind: "data", chip: "Set up",
      title: "Connect Google Ads so your ad spend is complete",
      body: "Without Google spend, total ROAS only covers Meta and looks better than it is.",
      why: "Shown until a Google Ads account is connected.",
      cta: { label: "Connect Google Ads", url: "/app/integrations/google" },
    });
  }

  // ── Meta campaigns with plenty of clicks and no purchases at all.
  if (i.periodDays >= 7) {
    const losers = byCampaign(i.metaCampaignDays)
      .filter((c) => c.spend > 0 && c.clicks >= 30 && c.purchases === 0)
      .sort((a, b) => b.spend - a.spend)
      .slice(0, 2);
    for (const c of losers) {
      out.push({
        id: `meta-noconv-${c.id}`, signature: `${Math.round(c.spend / 100)}`, kind: "fix", chip: "Fix",
        title: `“${c.name}” spent ${money(c.spend, i.currency)} with no purchases`,
        body: `${c.clicks.toLocaleString("en-US")} clicks in ${period} and nobody bought. Check that the ad links to a working product page, or pause the campaign.`,
        why: `Shown when a Meta campaign has 30 or more clicks and Meta reports no purchases over at least 7 days.`,
        cta: { label: "Open Meta Ads", url: "/app/meta-ads" },
      });
    }
  }

  // ── A campaign that has stayed above target for three weeks in a row.
  {
    const now = Date.now();
    const week = (d: string | Date) => Math.floor((now - new Date(d).getTime()) / (7 * 864e5));
    const weekly = new Map<string, { name: string; weeks: Array<{ spend: number; value: number }>; purchases: number }>();
    for (const r of i.metaCampaignDays21) {
      const w = week(r.date);
      if (w < 0 || w > 2) continue;
      const cur = weekly.get(r.campaignId) ?? { name: r.campaignName || r.campaignId, weeks: [0, 1, 2].map(() => ({ spend: 0, value: 0 })), purchases: 0 };
      cur.weeks[w].spend += r.spend; cur.weeks[w].value += r.value; cur.purchases += r.purchases;
      weekly.set(r.campaignId, cur);
    }
    const steady = [...weekly.entries()]
      .map(([id, c]) => {
        const spend = c.weeks.reduce((s, w) => s + w.spend, 0);
        const value = c.weeks.reduce((s, w) => s + w.value, 0);
        const everyWeek = c.weeks.every((w) => w.spend > 0 && w.value / w.spend >= TARGET_ROAS);
        return { id, ...c, spend, value, roas: spend > 0 ? value / spend : 0, everyWeek };
      })
      .filter((c) => c.everyWeek && c.purchases >= 10)
      .sort((a, b) => b.roas - a.roas)[0];
    if (steady) {
      out.push({
        id: `meta-steady-${steady.id}`, signature: `${Math.round(steady.roas * 10)}`, kind: "grow", chip: "Opportunity",
        title: `“${steady.name}” has stayed above ${formatRoas(TARGET_ROAS)} ROAS for 3 weeks`,
        body: `${steady.purchases} purchases worth ${money(steady.value, i.currency)} on ${money(steady.spend, i.currency)} spend, by Meta's count (${formatRoas(steady.roas)} ROAS). Many stores test 10–20% more budget on a campaign like this and watch it for a week.`,
        why: `Shown when a Meta campaign was at ${formatRoas(TARGET_ROAS)} ROAS or higher in each of the last 3 weeks, with at least 10 purchases. ROAS is sales, not profit: product costs, shipping and fees aren't included.`,
        cta: { label: "Open Meta Ads", url: "/app/meta-ads" },
      });
    }
  }

  // ── Orders whose source we can't name.
  const online = i.tracking.onlineOrders;
  if (online >= 5) {
    const noSource = online - i.tracking.onlineAttributed;
    const pct = Math.round((noSource / online) * 100);
    if (pct >= 30) {
      out.push({
        id: "coverage", signature: `${Math.round(pct / 10)}`, kind: "data", chip: "Data",
        title: `${pct}% of online orders aren't linked to a channel`,
        body: i.tracking.notTrackedOrders > 0
          ? `Attribix didn't see the visit for ${i.tracking.notTrackedOrders} of ${online} online orders, for example because of declined cookies, ad blockers or a different device. Channel numbers will undercount these sales.`
          : `${noSource} of ${online} online orders came from visits with no campaign tag or referrer. Add UTM tags to your ad and email links.`,
        why: `Shown when 30% or more of online orders in ${period} have no known source (at least 5 online orders).`,
        cta: { label: "See how tracking works", url: "/app/setup" },
      });
    }
  }
  const socialOrganic = i.sources.find((s) => s.source === "meta_organic");
  if (socialOrganic && socialOrganic.orders >= 10) {
    out.push({
      id: "social-utm", signature: `${Math.round(socialOrganic.orders / 10)}`, kind: "data", chip: "Data",
      title: `${socialOrganic.orders} orders came from unpaid Facebook or Instagram visits`,
      body: "You can't tell which post, story or bio link they came from. Give those links their own UTM campaign tags so you can see which ones sell.",
      why: `Shown when 10 or more orders in ${period} came from Facebook or Instagram without an ad click.`,
      cta: { label: "Open Orders", url: "/app/orders" },
    });
  }

  // ── Tools, only when the merchant's own numbers give a reason.
  const emailOrders = i.sources.find((s) => s.source === "email")?.orders ?? 0;
  if (i.orders >= 30 && emailOrders === 0 && i.tools.newsletterCampaignsSent === 0) {
    out.push({
      id: "tool-newsletter", signature: "1", kind: "tool", chip: "Try Newsletter",
      title: `${i.orders} orders in ${period}, and none came from email`,
      body: "Past customers already know your products. A short email when you have something new is often the cheapest way to get another sale.",
      why: `Shown when you had 30 or more orders, no orders came from email, and you haven't sent a newsletter with Attribix.`,
      cta: { label: "Set up Newsletter", url: "/app/newsletter" },
    });
  }
  const organic = i.sources.find((s) => s.source === "google_organic");
  if (organic && i.revenue > 0 && organic.revenue / i.revenue >= 0.1) {
    const share = Math.round((organic.revenue / i.revenue) * 100);
    out.push({
      id: "tool-seo", signature: `${Math.round(share / 5)}`, kind: "tool", chip: "Try SEO Audit",
      title: `Unpaid Google search brought ${share}% of your sales`,
      body: "Those sales cost nothing per click. SEO Audit checks your product pages and lists what keeps them from ranking higher.",
      why: `Shown when unpaid Google search is 10% or more of sales in ${period}.`,
      cta: { label: "Run SEO Audit", url: "/app/seo" },
    });
  }
  if (i.orders >= 20 && i.tools.totalReviews === 0) {
    out.push({
      id: "tool-reviews", signature: "1", kind: "tool", chip: "Try Reviews",
      title: `${i.orders} orders in ${period}, and no reviews collected yet`,
      body: "Attribix can email customers after they buy and show the reviews on your product pages and in Google Shopping.",
      why: "Shown when you had 20 or more orders and have no approved reviews in Attribix.",
      cta: { label: "Set up Reviews", url: "/app/reviews" },
    });
  }

  return out;
}
