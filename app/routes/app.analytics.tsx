// app/routes/app.analytics.tsx
import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { useMemo, useState } from "react";
import {
  Badge,
  BlockStack,
  Box,
  Button,
  Card,
  DataTable,
  Divider,
  Grid,
  InlineStack,
  Page,
  Select,
  Text,
} from "@shopify/polaris";
import db from "../db.server";

// ─── Loader ──────────────────────────────────────────────────────────────────

export async function loader({ request }: LoaderFunctionArgs) {
  const { authenticate } = await import("../shopify.server");
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const anyDb = db as any;

  const since30 = new Date();
  since30.setDate(since30.getDate() - 30);
  since30.setHours(0, 0, 0, 0);

  const since90 = new Date();
  since90.setDate(since90.getDate() - 90);
  since90.setHours(0, 0, 0, 0);

  const [
    purchases30d,
    allPurchases,
    adSpend30d,
    trackedEvents30d,
    metaCampaigns30d,
    metaAds,
  ] = await Promise.all([
    // All purchases last 30 days for KPIs + charts
    anyDb.purchase
      ?.findMany?.({
        where: { shop, createdAt: { gte: since30 } },
        select: {
          id: true,
          orderId: true,
          visitorId: true,
          utmSource: true,
          utmMedium: true,
          utmCampaign: true,
          totalValue: true,
          currency: true,
          fbclid: true,
          gclid: true,
          ttclid: true,
          msclkid: true,
          createdAt: true,
        },
      })
      .catch(() => []),

    // All-time purchases for source breakdown
    anyDb.purchase
      ?.findMany?.({
        where: { shop },
        select: {
          utmSource: true,
          utmMedium: true,
          utmCampaign: true,
          totalValue: true,
          currency: true,
          fbclid: true,
          gclid: true,
          ttclid: true,
          msclkid: true,
          createdAt: true,
        },
      })
      .catch(() => []),

    // Ad spend last 30 days per platform
    anyDb.adSpendDaily
      ?.findMany?.({
        where: { shop, date: { gte: since30 } },
        select: { platform: true, spend: true, date: true },
      })
      .catch(() => []),

    // Tracked events last 30 days for CVR
    anyDb.trackedEvent
      ?.findMany?.({
        where: { shop, createdAt: { gte: since30 } },
        select: { visitorId: true, utmSource: true, fbclid: true, gclid: true, ttclid: true, msclkid: true, createdAt: true },
      })
      .catch(() => []),

    // Meta Ads Manager campaign insights last 30 days
    anyDb.metaCampaignDailyInsight
      ?.findMany?.({
        where: { shop, date: { gte: since30 } },
        select: { campaignId: true, campaignName: true, spend: true, impressions: true, clicks: true, purchases: true, purchaseValue: true, date: true },
        orderBy: { date: "desc" },
      })
      .catch(() => []),

    // Meta ad-level insights last 30 days
    anyDb.metaAdDailyInsight
      ?.findMany?.({
        where: { shop, date: { gte: since30 } },
        select: { adId: true, adName: true, adSetName: true, campaignName: true, spend: true, impressions: true, clicks: true, ctr: true, cpc: true, purchases: true, purchaseValue: true, date: true },
        orderBy: { date: "desc" },
      })
      .catch(() => []),
  ]);

  return json({
    shop,
    purchases30d: purchases30d ?? [],
    allPurchases: allPurchases ?? [],
    adSpend30d: adSpend30d ?? [],
    trackedEvents30d: trackedEvents30d ?? [],
    metaCampaigns30d: metaCampaigns30d ?? [],
    metaAds30d: (metaAds as any) ?? [],
  });
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function safeNum(v: unknown) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function fmt(value: number, currency = "NOK") {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(value || 0);
  } catch {
    return `${currency} ${Number(value || 0).toFixed(0)}`;
  }
}

function fmtDecimal(value: number, currency = "NOK") {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(value || 0);
  } catch {
    return `${currency} ${Number(value || 0).toFixed(2)}`;
  }
}

function dayKey(v: unknown) {
  if (!v) return "";
  const d = new Date(v as string);
  return isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
}

function labelShort(iso: string) {
  try {
    return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short" }).format(new Date(iso));
  } catch { return iso; }
}

function normalizeSource(item: any): string {
  const s = String(item?.utmSource || "").toLowerCase().trim();
  if (s.includes("google") || s.includes("adwords")) return "google";
  if (s.includes("meta") || s.includes("facebook") || s.includes("instagram")) return "meta";
  if (s.includes("tiktok")) return "tiktok";
  if (s.includes("snap")) return "snapchat";
  if (s.includes("bing") || s.includes("microsoft")) return "microsoft";
  if (s) return s;
  if (item?.gclid) return "google";
  if (item?.fbclid) return "meta";
  if (item?.ttclid) return "tiktok";
  if (item?.msclkid) return "microsoft";
  return "unknown";
}

function sourceTone(s: string): any {
  if (s === "meta" || s === "facebook") return "info";
  if (s === "google") return "success";
  if (s === "tiktok") return "attention";
  return "new";
}

// Detect the dominant currency from purchases
function detectCurrency(purchases: any[]): string {
  const counts: Record<string, number> = {};
  for (const p of purchases) {
    const c = String(p.currency || "").toUpperCase();
    if (c) counts[c] = (counts[c] || 0) + 1;
  }
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  return entries[0]?.[0] || "USD";
}

// ─── Chart component ──────────────────────────────────────────────────────────

function BarChart({ data }: { data: Array<{ label: string; revenue: number; spend: number }> }) {
  const maxVal = Math.max(1, ...data.flatMap((d) => [d.revenue, d.spend]));
  const showEvery = Math.ceil(data.length / 10);

  return (
    <div style={{ width: "100%", overflowX: "auto" }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${data.length}, minmax(0, 1fr))`,
          gap: 3,
          alignItems: "end",
          minHeight: 200,
          minWidth: data.length * 24,
        }}
      >
        {data.map((row, i) => (
          <div
            key={row.label}
            title={`${row.label}  Revenue: ${row.revenue}  Spend: ${row.spend}`}
            style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "end" }}
          >
            <div style={{ width: "100%", height: 160, display: "flex", alignItems: "end", justifyContent: "center", gap: 2 }}>
              <div style={{ width: "44%", minHeight: 2, height: `${(row.revenue / maxVal) * 100}%`, borderRadius: 3, background: "#111827" }} />
              <div style={{ width: "44%", minHeight: 2, height: `${(row.spend / maxVal) * 100}%`, borderRadius: 3, background: "#9ca3af" }} />
            </div>
            <div style={{ marginTop: 6, fontSize: 10, color: "#9ca3af", textAlign: "center", whiteSpace: "nowrap" }}>
              {i % showEvery === 0 ? row.label : ""}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── KPI card ─────────────────────────────────────────────────────────────────

function KPI({ label, value, sub, highlight }: { label: string; value: string; sub?: string; highlight?: boolean }) {
  return (
    <Card>
      <BlockStack gap="100">
        <Text as="p" variant="bodySm" tone="subdued">{label}</Text>
        <Text as="p" variant="heading2xl" tone={highlight ? "success" : undefined}>{value}</Text>
        {sub && <Text as="p" variant="bodySm" tone="subdued">{sub}</Text>}
      </BlockStack>
    </Card>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AppAnalytics() {
  const data = useLoaderData<typeof loader>();
  const [window, setWindow] = useState<"7" | "14" | "30">("30");

  const currency = useMemo(() => detectCurrency(data.purchases30d), [data.purchases30d]);

  const windowDays = Number(window);
  const windowCutoff = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - windowDays);
    d.setHours(0, 0, 0, 0);
    return d;
  }, [windowDays]);

  // Filter purchases to selected window
  const purchases = useMemo(
    () => data.purchases30d.filter((p: any) => new Date(p.createdAt) >= windowCutoff),
    [data.purchases30d, windowCutoff]
  );

  // Filter ad spend to selected window
  const spendRows = useMemo(
    () => data.adSpend30d.filter((r: any) => new Date(r.date) >= windowCutoff),
    [data.adSpend30d, windowCutoff]
  );

  // Filter meta campaigns to window
  const metaCampaigns = useMemo(
    () => data.metaCampaigns30d.filter((r: any) => new Date(r.date) >= windowCutoff),
    [data.metaCampaigns30d, windowCutoff]
  );

  // ── KPIs ──
  const totalRevenue = useMemo(() => purchases.reduce((s: number, p: any) => s + safeNum(p.totalValue), 0), [purchases]);
  const totalOrders = purchases.length;
  const aov = totalOrders > 0 ? totalRevenue / totalOrders : 0;

  const totalSpend = useMemo(() => spendRows.reduce((s: number, r: any) => s + safeNum(r.spend), 0), [spendRows]);
  const metaSpend = useMemo(() => spendRows.filter((r: any) => String(r.platform).toLowerCase().includes("meta")).reduce((s: number, r: any) => s + safeNum(r.spend), 0), [spendRows]);
  const googleSpend = useMemo(() => spendRows.filter((r: any) => String(r.platform).toLowerCase().includes("google")).reduce((s: number, r: any) => s + safeNum(r.spend), 0), [spendRows]);
  const blendedRoas = totalSpend > 0 ? totalRevenue / totalSpend : null;

  // ── Meta Ads Manager aggregated ──
  const metaAdsKpis = useMemo(() => {
    let spend = 0, purchases = 0, value = 0;
    for (const r of metaCampaigns) {
      spend += safeNum((r as any).spend);
      purchases += safeNum((r as any).purchases);
      value += safeNum((r as any).purchaseValue);
    }
    return { spend, purchases, value, roas: spend > 0 ? value / spend : null };
  }, [metaCampaigns]);

  // ── Meta campaign table (Ads Manager) ──
  const metaCampaignRows = useMemo(() => {
    const map = new Map<string, { name: string; spend: number; purchases: number; value: number }>();
    for (const r of metaCampaigns) {
      const id = String((r as any).campaignId);
      const cur = map.get(id) || { name: (r as any).campaignName || id, spend: 0, purchases: 0, value: 0 };
      cur.spend += safeNum((r as any).spend);
      cur.purchases += safeNum((r as any).purchases);
      cur.value += safeNum((r as any).purchaseValue);
      map.set(id, cur);
    }
    return Array.from(map.values())
      .sort((a, b) => b.spend - a.spend)
      .map((c) => {
        const roas = c.spend > 0 ? (c.value / c.spend).toFixed(2) : "—";
        const cpa = c.purchases > 0 ? fmt(c.spend / c.purchases, currency) : "—";
        return [
          c.name,
          fmtDecimal(c.spend, currency),
          String(c.purchases),
          fmtDecimal(c.value, currency),
          roas,
          cpa,
        ];
      });
  }, [metaCampaigns, currency]);

  // ── Meta ad-level table ──
  const metaAdRows = useMemo(() => {
    const map = new Map<string, { name: string; adSet: string; campaign: string; spend: number; impressions: number; clicks: number; purchases: number; value: number }>();
    for (const r of (data as any).metaAds30d ?? []) {
      if (new Date((r as any).date) < windowCutoff) continue;
      const id = String((r as any).adId);
      const cur = map.get(id) || { name: (r as any).adName || id, adSet: (r as any).adSetName || "—", campaign: (r as any).campaignName || "—", spend: 0, impressions: 0, clicks: 0, purchases: 0, value: 0 };
      cur.spend += safeNum((r as any).spend);
      cur.impressions += safeNum((r as any).impressions);
      cur.clicks += safeNum((r as any).clicks);
      cur.purchases += safeNum((r as any).purchases);
      cur.value += safeNum((r as any).purchaseValue);
      map.set(id, cur);
    }
    return Array.from(map.values())
      .sort((a, b) => b.spend - a.spend)
      .map((a) => {
        const roas = a.spend > 0 ? (a.value / a.spend).toFixed(2) : "—";
        const ctr = a.impressions > 0 ? ((a.clicks / a.impressions) * 100).toFixed(2) + "%" : "—";
        const cpc = a.clicks > 0 ? fmtDecimal(a.spend / a.clicks, currency) : "—";
        const cpa = a.purchases > 0 ? fmtDecimal(a.spend / a.purchases, currency) : "—";
        return [a.name, a.adSet, a.campaign, fmtDecimal(a.spend, currency), String(a.impressions.toLocaleString()), ctr, cpc, String(a.purchases), fmtDecimal(a.value, currency), roas, cpa];
      });
  }, [(data as any).metaAds30d, windowCutoff, currency]);

  // ── Top performers (best ROAS campaign + ad) ──
  const topCampaign = useMemo(() => {
    const rows = Array.from((() => {
      const map = new Map<string, { name: string; spend: number; value: number; purchases: number }>();
      for (const r of metaCampaigns) {
        const id = String((r as any).campaignId);
        const cur = map.get(id) || { name: (r as any).campaignName || id, spend: 0, value: 0, purchases: 0 };
        cur.spend += safeNum((r as any).spend);
        cur.value += safeNum((r as any).purchaseValue);
        cur.purchases += safeNum((r as any).purchases);
        map.set(id, cur);
      }
      return map;
    })().values()).filter((c) => c.spend > 0);
    if (!rows.length) return null;
    return rows.sort((a, b) => (b.value / b.spend) - (a.value / a.spend))[0];
  }, [metaCampaigns]);

  const topAd = useMemo(() => {
    const filtered = ((data as any).metaAds30d ?? []).filter((r: any) => new Date(r.date) >= windowCutoff);
    const map = new Map<string, { name: string; spend: number; value: number; purchases: number; clicks: number; impressions: number }>();
    for (const r of filtered) {
      const id = String(r.adId);
      const cur = map.get(id) || { name: r.adName || id, spend: 0, value: 0, purchases: 0, clicks: 0, impressions: 0 };
      cur.spend += safeNum(r.spend);
      cur.value += safeNum(r.purchaseValue);
      cur.purchases += safeNum(r.purchases);
      cur.clicks += safeNum(r.clicks);
      cur.impressions += safeNum(r.impressions);
      map.set(id, cur);
    }
    const rows = Array.from(map.values()).filter((a) => a.spend > 0);
    if (!rows.length) return null;
    return rows.sort((a, b) => (b.value / b.spend) - (a.value / a.spend))[0];
  }, [(data as any).metaAds30d, windowCutoff]);

  // ── Attribution by source ──
  const sourceRows = useMemo(() => {
    const map = new Map<string, { orders: number; revenue: number }>();
    for (const p of purchases) {
      const src = normalizeSource(p);
      const cur = map.get(src) || { orders: 0, revenue: 0 };
      cur.orders++;
      cur.revenue += safeNum((p as any).totalValue);
      map.set(src, cur);
    }
    return Array.from(map.entries())
      .sort((a, b) => b[1].revenue - a[1].revenue)
      .map(([src, s]) => [
        <InlineStack key={src} gap="200" blockAlign="center">
          <Badge tone={sourceTone(src)}>{src}</Badge>
        </InlineStack>,
        String(s.orders),
        fmtDecimal(s.revenue, currency),
        totalRevenue > 0 ? `${((s.revenue / totalRevenue) * 100).toFixed(1)}%` : "—",
      ]);
  }, [purchases, totalRevenue, currency]);

  // ── Platform ROAS comparison (our attribution vs Ads Manager) ──
  const platformRoasRows = useMemo(() => {
    const revenueMap = new Map<string, number>();
    const spendMap = new Map<string, number>();
    const ordersMap = new Map<string, number>();

    for (const p of purchases) {
      const src = normalizeSource(p);
      revenueMap.set(src, (revenueMap.get(src) || 0) + safeNum((p as any).totalValue));
      ordersMap.set(src, (ordersMap.get(src) || 0) + 1);
    }
    for (const r of spendRows) {
      const plat = String((r as any).platform).toLowerCase().replace("facebook", "meta");
      spendMap.set(plat, (spendMap.get(plat) || 0) + safeNum((r as any).spend));
    }

    const platforms = Array.from(new Set([...revenueMap.keys(), ...spendMap.keys()])).sort();
    return platforms.map((plat) => {
      const rev = revenueMap.get(plat) || 0;
      const spend = spendMap.get(plat) || 0;
      const orders = ordersMap.get(plat) || 0;
      const roas = spend > 0 ? (rev / spend).toFixed(2) : "—";
      const cpa = orders > 0 && spend > 0 ? fmtDecimal(spend / orders, currency) : "—";
      return [
        <Badge key={plat} tone={sourceTone(plat)}>{plat}</Badge>,
        String(orders),
        fmtDecimal(rev, currency),
        fmtDecimal(spend, currency),
        roas,
        cpa,
      ];
    });
  }, [purchases, spendRows, currency]);

  // ── Traffic quality (CVR) ──
  const trafficRows = useMemo(() => {
    const visitors = new Map<string, Set<string>>();
    const convMap = new Map<string, number>();

    for (const e of data.trackedEvents30d) {
      if (new Date((e as any).createdAt) < windowCutoff) continue;
      const src = normalizeSource(e);
      if (!(visitors.has(src))) visitors.set(src, new Set());
      const vid = String((e as any).visitorId || Math.random());
      visitors.get(src)!.add(vid);
    }
    for (const p of purchases) {
      const src = normalizeSource(p);
      convMap.set(src, (convMap.get(src) || 0) + 1);
      if (!visitors.has(src)) visitors.set(src, new Set());
      if ((p as any).visitorId) visitors.get(src)!.add(String((p as any).visitorId));
    }

    return Array.from(visitors.entries())
      .sort((a, b) => b[1].size - a[1].size)
      .map(([src, vis]) => {
        const conv = convMap.get(src) || 0;
        const cvr = vis.size > 0 ? ((conv / vis.size) * 100).toFixed(2) + "%" : "—";
        return [
          <Badge key={src} tone={sourceTone(src)}>{src}</Badge>,
          String(vis.size),
          String(conv),
          cvr,
        ];
      });
  }, [data.trackedEvents30d, purchases, windowCutoff]);

  // ── Campaign attribution table ──
  const campaignRows = useMemo(() => {
    const map = new Map<string, { source: string; orders: number; revenue: number }>();
    for (const p of purchases) {
      const campaign = String((p as any).utmCampaign || "").trim() || "(none)";
      const src = normalizeSource(p);
      const cur = map.get(campaign) || { source: src, orders: 0, revenue: 0 };
      cur.orders++;
      cur.revenue += safeNum((p as any).totalValue);
      map.set(campaign, cur);
    }
    return Array.from(map.entries())
      .sort((a, b) => b[1].revenue - a[1].revenue)
      .slice(0, 10)
      .map(([campaign, s]) => [
        campaign,
        <Badge key={campaign} tone={sourceTone(s.source)}>{s.source}</Badge>,
        String(s.orders),
        fmtDecimal(s.revenue, currency),
      ]);
  }, [purchases, currency]);

  // ── Chart ──
  const chartData = useMemo(() => {
    const map = new Map<string, { label: string; revenue: number; spend: number }>();
    for (let i = windowDays - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const k = d.toISOString().slice(0, 10);
      map.set(k, { label: labelShort(k), revenue: 0, spend: 0 });
    }
    for (const p of data.purchases30d) {
      const k = dayKey((p as any).createdAt);
      const cur = map.get(k);
      if (cur) cur.revenue += safeNum((p as any).totalValue);
    }
    for (const r of data.adSpend30d) {
      const k = dayKey((r as any).date);
      const cur = map.get(k);
      if (cur) cur.spend += safeNum((r as any).spend);
    }
    return Array.from(map.values());
  }, [data.purchases30d, data.adSpend30d, windowDays]);

  const hasMetaData = metaCampaignRows.length > 0;
  const hasSpend = totalSpend > 0;

  return (
    <Page
      fullWidth
      title="Attribution Analytics"
      subtitle={`${windowDays}-day window · Shop: ${data.shop}`}
      primaryAction={
        <Select
          label=""
          labelHidden
          options={[
            { label: "Last 7 days", value: "7" },
            { label: "Last 14 days", value: "14" },
            { label: "Last 30 days", value: "30" },
          ]}
          value={window}
          onChange={(v) => setWindow(v as any)}
        />
      }
    >
      <BlockStack gap="600">

        {/* ── KPI row ── */}
        <Grid>
          {[
            { label: `Revenue (${window}d)`, value: fmtDecimal(totalRevenue, currency), sub: `${totalOrders} attributed orders` },
            { label: `Ad Spend (${window}d)`, value: fmtDecimal(totalSpend, currency), sub: hasSpend ? `Meta ${fmtDecimal(metaSpend, currency)} · Google ${fmtDecimal(googleSpend, currency)}` : "Sync spend in Integrations" },
            { label: `Blended ROAS (${window}d)`, value: blendedRoas ? blendedRoas.toFixed(2) + "×" : "—", sub: hasSpend ? "Revenue ÷ total spend" : "No spend data", highlight: blendedRoas !== null && blendedRoas >= 2 },
            { label: "Avg Order Value", value: aov > 0 ? fmtDecimal(aov, currency) : "—", sub: "Attributed purchases" },
          ].map((kpi) => (
            <Grid.Cell key={kpi.label} columnSpan={{ xs: 6, sm: 3, md: 3, lg: 3, xl: 3 }}>
              <KPI {...kpi} />
            </Grid.Cell>
          ))}
        </Grid>

        {/* ── Meta Ads Manager KPIs (when data available) ── */}
        {hasMetaData && (
          <Card>
            <BlockStack gap="400">
              <InlineStack align="space-between" blockAlign="center">
                <BlockStack gap="100">
                  <Text as="h2" variant="headingMd">Meta Ads Manager</Text>
                  <Text as="p" variant="bodySm" tone="subdued">
                    Reported by Meta — last {window} days · Spend, purchases, and ROAS as Meta counts them
                  </Text>
                </BlockStack>
                <Badge tone="info">Ads Manager data</Badge>
              </InlineStack>

              <Grid>
                {[
                  { label: "Meta spend", value: fmtDecimal(metaAdsKpis.spend, currency) },
                  { label: "Meta purchases (reported)", value: String(metaAdsKpis.purchases), sub: "Counted by Meta pixel" },
                  { label: "Meta purchase value", value: fmtDecimal(metaAdsKpis.value, currency) },
                  { label: "Meta ROAS", value: metaAdsKpis.roas ? metaAdsKpis.roas.toFixed(2) + "×" : "—", sub: "Meta value ÷ Meta spend" },
                ].map((kpi) => (
                  <Grid.Cell key={kpi.label} columnSpan={{ xs: 6, sm: 3, md: 3, lg: 3, xl: 3 }}>
                    <Box background="bg-surface-secondary" padding="400" borderRadius="200">
                      <BlockStack gap="100">
                        <Text as="p" variant="bodySm" tone="subdued">{kpi.label}</Text>
                        <Text as="p" variant="headingXl">{kpi.value}</Text>
                        {(kpi as any).sub && <Text as="p" variant="bodySm" tone="subdued">{(kpi as any).sub}</Text>}
                      </BlockStack>
                    </Box>
                  </Grid.Cell>
                ))}
              </Grid>

              <Divider />

              {/* Comparison callout */}
              <Grid>
                <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 6, xl: 6 }}>
                  <Box background="bg-surface-secondary" padding="300" borderRadius="200">
                    <BlockStack gap="100">
                      <Text as="p" variant="bodySm" tone="subdued">Attribix attributed revenue (meta)</Text>
                      <Text as="p" variant="headingLg">
                        {fmtDecimal(
                          purchases
                            .filter((p: any) => normalizeSource(p) === "meta")
                            .reduce((s: number, p: any) => s + safeNum(p.totalValue), 0),
                          currency
                        )}
                      </Text>
                      <Text as="p" variant="bodySm" tone="subdued">
                        What Attribix tracked via UTM/fbclid attribution — may differ from Meta's reported value due to view-through, cross-device, or iOS gaps
                      </Text>
                    </BlockStack>
                  </Box>
                </Grid.Cell>
                <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 6, xl: 6 }}>
                  <Box background="bg-surface-secondary" padding="300" borderRadius="200">
                    <BlockStack gap="100">
                      <Text as="p" variant="bodySm" tone="subdued">Meta reported purchase value</Text>
                      <Text as="p" variant="headingLg">{fmtDecimal(metaAdsKpis.value, currency)}</Text>
                      <Text as="p" variant="bodySm" tone="subdued">
                        What Meta Ads Manager reports — includes view-through conversions and Meta's attribution window (typically 7-day click, 1-day view)
                      </Text>
                    </BlockStack>
                  </Box>
                </Grid.Cell>
              </Grid>

              <Divider />

              {/* ── Top performer highlights ── */}
              {(topCampaign || topAd) && (
                <Grid>
                  {topCampaign && (
                    <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 6, xl: 6 }}>
                      <Box background="bg-surface-success" padding="400" borderRadius="200">
                        <BlockStack gap="100">
                          <InlineStack gap="200" blockAlign="center">
                            <Badge tone="success">🏆 Best campaign</Badge>
                          </InlineStack>
                          <Text as="p" variant="headingMd">{topCampaign.name}</Text>
                          <InlineStack gap="400">
                            <Text as="p" variant="bodySm" tone="subdued">ROAS: <Text as="span" fontWeight="bold">{topCampaign.spend > 0 ? (topCampaign.value / topCampaign.spend).toFixed(2) + "×" : "—"}</Text></Text>
                            <Text as="p" variant="bodySm" tone="subdued">Spend: {fmtDecimal(topCampaign.spend, currency)}</Text>
                            <Text as="p" variant="bodySm" tone="subdued">Value: {fmtDecimal(topCampaign.value, currency)}</Text>
                          </InlineStack>
                        </BlockStack>
                      </Box>
                    </Grid.Cell>
                  )}
                  {topAd && (
                    <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 6, xl: 6 }}>
                      <Box background="bg-surface-success" padding="400" borderRadius="200">
                        <BlockStack gap="100">
                          <InlineStack gap="200" blockAlign="center">
                            <Badge tone="success">🏆 Best ad</Badge>
                          </InlineStack>
                          <Text as="p" variant="headingMd">{topAd.name}</Text>
                          <InlineStack gap="400">
                            <Text as="p" variant="bodySm" tone="subdued">ROAS: <Text as="span" fontWeight="bold">{topAd.spend > 0 ? (topAd.value / topAd.spend).toFixed(2) + "×" : "—"}</Text></Text>
                            <Text as="p" variant="bodySm" tone="subdued">CTR: {topAd.impressions > 0 ? ((topAd.clicks / topAd.impressions) * 100).toFixed(2) + "%" : "—"}</Text>
                            <Text as="p" variant="bodySm" tone="subdued">Spend: {fmtDecimal(topAd.spend, currency)}</Text>
                          </InlineStack>
                        </BlockStack>
                      </Box>
                    </Grid.Cell>
                  )}
                </Grid>
              )}

              <Divider />

              <Text as="h3" variant="headingSm">Campaign breakdown (Ads Manager)</Text>
              <DataTable
                columnContentTypes={["text", "numeric", "numeric", "numeric", "numeric", "numeric"]}
                headings={["Campaign", "Spend", "Purchases (Meta)", "Purchase value", "ROAS", "CPA"]}
                rows={metaCampaignRows}
                increasedTableDensity
              />

              <Divider />

              <Text as="h3" variant="headingSm">Ad breakdown (Ads Manager)</Text>
              {metaAdRows.length > 0 ? (
                <DataTable
                  columnContentTypes={["text", "text", "text", "numeric", "numeric", "numeric", "numeric", "numeric", "numeric", "numeric", "numeric"]}
                  headings={["Ad name", "Ad set", "Campaign", "Spend", "Impressions", "CTR", "CPC", "Purchases", "Value", "ROAS", "CPA"]}
                  rows={metaAdRows}
                  increasedTableDensity
                />
              ) : (
                <Text as="p" tone="subdued" variant="bodySm">Ad-level data will appear after the next sync.</Text>
              )}
            </BlockStack>
          </Card>
        )}

        {!hasMetaData && (
          <Card>
            <BlockStack gap="200">
              <Text as="h2" variant="headingMd">Meta Ads Manager</Text>
              <Text as="p" tone="subdued">
                No Ads Manager data for this window. Go to{" "}
                <Button url="/app/ads" variant="plain">Integrations → Meta</Button>{" "}
                and run a spend sync to see campaign-level spend, ROAS, and CPA here.
              </Text>
            </BlockStack>
          </Card>
        )}

        {/* ── Revenue & Spend chart ── */}
        <Card>
          <BlockStack gap="300">
            <InlineStack align="space-between" blockAlign="center">
              <Text as="h2" variant="headingMd">Revenue vs spend — last {window} days</Text>
              <InlineStack gap="300" blockAlign="center">
                <InlineStack gap="100" blockAlign="center">
                  <div style={{ width: 10, height: 10, borderRadius: 99, background: "#111827" }} />
                  <Text as="span" variant="bodySm" tone="subdued">Revenue</Text>
                </InlineStack>
                <InlineStack gap="100" blockAlign="center">
                  <div style={{ width: 10, height: 10, borderRadius: 99, background: "#9ca3af" }} />
                  <Text as="span" variant="bodySm" tone="subdued">Spend</Text>
                </InlineStack>
              </InlineStack>
            </InlineStack>
            <BarChart data={chartData} />
          </BlockStack>
        </Card>

        {/* ── Platform ROAS (our attribution vs paid) ── */}
        <Card>
          <BlockStack gap="300">
            <BlockStack gap="100">
              <Text as="h2" variant="headingMd">Platform performance</Text>
              <Text as="p" variant="bodySm" tone="subdued">
                Attribix-attributed revenue and orders vs synced ad spend — last {window} days
              </Text>
            </BlockStack>
            {platformRoasRows.length > 0 ? (
              <DataTable
                columnContentTypes={["text", "numeric", "numeric", "numeric", "numeric", "numeric"]}
                headings={["Platform", "Orders", "Attributed revenue", "Ad spend", "ROAS", "CPA"]}
                rows={platformRoasRows}
                increasedTableDensity
              />
            ) : (
              <Text as="p" tone="subdued">No data for this window.</Text>
            )}
          </BlockStack>
        </Card>

        {/* ── Attribution by source ── */}
        <Card>
          <BlockStack gap="300">
            <BlockStack gap="100">
              <Text as="h2" variant="headingMd">Revenue by source</Text>
              <Text as="p" variant="bodySm" tone="subdued">All attributed purchases — last {window} days</Text>
            </BlockStack>
            {sourceRows.length > 0 ? (
              <DataTable
                columnContentTypes={["text", "numeric", "numeric", "numeric"]}
                headings={["Source", "Orders", "Revenue", "Share"]}
                rows={sourceRows}
                increasedTableDensity
              />
            ) : (
              <Text as="p" tone="subdued">No purchases in this window.</Text>
            )}
          </BlockStack>
        </Card>

        {/* ── Traffic quality ── */}
        <Card>
          <BlockStack gap="300">
            <BlockStack gap="100">
              <Text as="h2" variant="headingMd">Traffic quality</Text>
              <Text as="p" variant="bodySm" tone="subdued">Unique visitors and conversion rate by source — last {window} days</Text>
            </BlockStack>
            {trafficRows.length > 0 ? (
              <DataTable
                columnContentTypes={["text", "numeric", "numeric", "numeric"]}
                headings={["Source", "Visitors", "Purchases", "CVR"]}
                rows={trafficRows}
                increasedTableDensity
              />
            ) : (
              <Text as="p" tone="subdued">No traffic data for this window.</Text>
            )}
          </BlockStack>
        </Card>

        {/* ── Campaign attribution ── */}
        <Card>
          <BlockStack gap="300">
            <BlockStack gap="100">
              <Text as="h2" variant="headingMd">Campaign attribution</Text>
              <Text as="p" variant="bodySm" tone="subdued">Top 10 campaigns by attributed revenue — last {window} days</Text>
            </BlockStack>
            {campaignRows.length > 0 ? (
              <DataTable
                columnContentTypes={["text", "text", "numeric", "numeric"]}
                headings={["Campaign", "Source", "Orders", "Revenue"]}
                rows={campaignRows}
                increasedTableDensity
              />
            ) : (
              <Text as="p" tone="subdued">No campaign data for this window.</Text>
            )}
          </BlockStack>
        </Card>

      </BlockStack>
    </Page>
  );
}
