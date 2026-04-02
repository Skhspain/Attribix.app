// app/routes/app.analytics.tsx
import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, useFetcher } from "@remix-run/react";
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
    newsletterRevenue30d,
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
          country: true,
          city: true,
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

    // Newsletter campaign attributed revenue last 30 days
    anyDb.newsletterCampaign
      ?.findMany?.({
        where: { shop, status: "sent", sentAt: { gte: since30 } },
        select: { revenueAttributed: true },
      })
      .catch(() => []) ?? [],
  ]);

  const metaConn = await db.metaConnection
    .findUnique({ where: { shop }, select: { lastSyncedAt: true, adAccountId: true } })
    .catch(() => null);

  return json({
    shop,
    nowMs: Date.now(),
    purchases30d: purchases30d ?? [],
    allPurchases: allPurchases ?? [],
    adSpend30d: adSpend30d ?? [],
    trackedEvents30d: trackedEvents30d ?? [],
    metaCampaigns30d: metaCampaigns30d ?? [],
    metaAds30d: (metaAds as any) ?? [],
    metaLastSyncedAt: metaConn?.lastSyncedAt ?? null,
    metaConnected: !!(metaConn?.adAccountId),
    newsletterRevenue30d: newsletterRevenue30d ?? [],
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
    return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", timeZone: "UTC" }).format(new Date(iso));
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

function bucketSource(item: any): "ads" | "email" | "organic" {
  const src = normalizeSource(item);
  if (["google", "meta", "tiktok", "microsoft", "snapchat"].includes(src)) return "ads";
  const medium = String(item?.utmMedium || "").toLowerCase();
  if (medium === "email" || src.includes("email") || src.includes("newsletter")) return "email";
  return "organic";
}

function detectStage(adsPct: number, emailPct: number) {
  if (adsPct >= 70) {
    return {
      emoji: "🟢",
      label: "Early stage",
      range: "0 – €50k/month",
      bg: "#f0fdf4",
      border: "#16a34a",
      text: "#15803d",
      advice: "You're basically buying all your revenue. Build your email list and organic channels now.",
      adTarget: "70–90%",
      emailTarget: "5–15%",
      organicTarget: "5–20%",
    };
  }
  if (adsPct >= 50) {
    return {
      emoji: "🟡",
      label: "Growth stage",
      range: "€50k – €300k/month",
      bg: "#fffbeb",
      border: "#d97706",
      text: "#b45309",
      advice: "This is where things start getting healthy. Keep pushing email and organic.",
      adTarget: "50–70%",
      emailTarget: "15–25%",
      organicTarget: "15–30%",
    };
  }
  return {
    emoji: "🔵",
    label: "Mature brand",
    range: "€300k+/month",
    bg: "#eff6ff",
    border: "#2563eb",
    text: "#1d4ed8",
    advice: "This is where profit actually comes from. Excellent channel diversity.",
    adTarget: "30–50%",
    emailTarget: "20–35%",
    organicTarget: "25–40%",
  };
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
  const [tooltip, setTooltip] = useState<{ x: number; y: number; label: string; revenue: number; spend: number } | null>(null);

  return (
    <div style={{ width: "100%", overflowX: "auto", position: "relative" }}>
      {tooltip && (
        <div style={{
          position: "fixed",
          left: tooltip.x + 12,
          top: tooltip.y - 10,
          background: "#1f2937",
          color: "#fff",
          borderRadius: 8,
          padding: "8px 12px",
          fontSize: 12,
          pointerEvents: "none",
          zIndex: 9999,
          whiteSpace: "nowrap",
          boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
        }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>{tooltip.label}</div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#6366f1", display: "inline-block" }} />
            Revenue: {tooltip.revenue > 0 ? tooltip.revenue.toLocaleString("en-US", { maximumFractionDigits: 0 }) : "0"}
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 2 }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#38bdf8", display: "inline-block" }} />
            Spend: {tooltip.spend > 0 ? tooltip.spend.toLocaleString("en-US", { maximumFractionDigits: 0 }) : "0"}
          </div>
        </div>
      )}
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
            onMouseMove={(e) => setTooltip({ x: e.clientX, y: e.clientY, ...row })}
            onMouseLeave={() => setTooltip(null)}
            style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "end", cursor: "default" }}
          >
            <div style={{ width: "100%", height: 160, display: "flex", alignItems: "end", justifyContent: "center", gap: 2 }}>
              <div style={{
                width: "44%", minHeight: 2,
                height: `${(row.revenue / maxVal) * 100}%`,
                borderRadius: "3px 3px 0 0",
                background: "linear-gradient(180deg, #818cf8 0%, #6366f1 100%)",
                transition: "height 0.2s ease",
              }} />
              <div style={{
                width: "44%", minHeight: 2,
                height: `${(row.spend / maxVal) * 100}%`,
                borderRadius: "3px 3px 0 0",
                background: "linear-gradient(180deg, #7dd3fc 0%, #38bdf8 100%)",
                transition: "height 0.2s ease",
              }} />
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
  const locationBackfill = useFetcher<{ ok: boolean; updated: number; total: number; message?: string }>();

  const currency = useMemo(() => detectCurrency(data.purchases30d), [data.purchases30d]);

  const windowDays = Number(window);
  const windowCutoff = useMemo(() => {
    const d = new Date(data.nowMs);
    d.setUTCDate(d.getUTCDate() - windowDays);
    d.setUTCHours(0, 0, 0, 0);
    return d;
  }, [windowDays, data.nowMs]);

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
        return [a.name, a.adSet, a.campaign, fmtDecimal(a.spend, currency), String(a.impressions.toLocaleString("en-US")), ctr, cpc, String(a.purchases), fmtDecimal(a.value, currency), roas, cpa];
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

  // ── Source breakdown cards ──
  const sourceBreakdown = useMemo(() => {
    const map = new Map<string, { orders: number; revenue: number }>();
    for (const p of purchases) {
      const src = normalizeSource(p);
      const cur = map.get(src) || { orders: 0, revenue: 0 };
      cur.orders++;
      cur.revenue += safeNum((p as any).totalValue);
      map.set(src, cur);
    }
    const totalRev = Array.from(map.values()).reduce((s, r) => s + r.revenue, 0);
    return Array.from(map.entries())
      .sort((a, b) => b[1].revenue - a[1].revenue)
      .map(([src, r]) => ({
        source: src,
        orders: r.orders,
        revenue: r.revenue,
        share: totalRev > 0 ? Math.round((r.revenue / totalRev) * 100) : 0,
      }));
  }, [purchases, currency]);

  const healthBreakdown = useMemo(() => {
    const buckets = { ads: 0, email: 0, organic: 0 };
    for (const p of purchases) {
      const b = bucketSource(p);
      buckets[b] += safeNum((p as any).totalValue);
    }
    // Add newsletter campaign attributed revenue
    const newsletterRev = ((data as any).newsletterRevenue30d ?? [])
      .reduce((s: number, c: any) => s + safeNum(c.revenueAttributed), 0);
    buckets.email += newsletterRev;
    const total = buckets.ads + buckets.email + buckets.organic || 1;
    return {
      ads: { value: buckets.ads, pct: Math.round((buckets.ads / total) * 100) },
      email: { value: buckets.email, pct: Math.round((buckets.email / total) * 100) },
      organic: { value: buckets.organic, pct: Math.round((buckets.organic / total) * 100) },
      total,
    };
  }, [purchases, data]);

  // ── Attribution by source (table fallback) ──
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

  // ── Customers by country ──
  const countryRows = useMemo(() => {
    const map = new Map<string, { orders: number; revenue: number }>();
    for (const p of purchases) {
      const c = String((p as any).country || "").trim() || "Unknown";
      const cur = map.get(c) || { orders: 0, revenue: 0 };
      cur.orders++;
      cur.revenue += safeNum((p as any).totalValue);
      map.set(c, cur);
    }
    const total = Array.from(map.values()).reduce((s, r) => s + r.revenue, 0);
    return Array.from(map.entries())
      .sort((a, b) => b[1].revenue - a[1].revenue)
      .slice(0, 10)
      .map(([country, r]) => [
        country,
        String(r.orders),
        fmtDecimal(r.revenue, currency),
        total > 0 ? `${((r.revenue / total) * 100).toFixed(1)}%` : "—",
      ]);
  }, [purchases, currency]);

  // ── Customers by city ──
  const cityRows = useMemo(() => {
    const map = new Map<string, { orders: number; revenue: number; country: string }>();
    for (const p of purchases) {
      const city = String((p as any).city || "").trim();
      const country = String((p as any).country || "").trim();
      if (!city) continue;
      const key = city;
      const cur = map.get(key) || { orders: 0, revenue: 0, country };
      cur.orders++;
      cur.revenue += safeNum((p as any).totalValue);
      map.set(key, cur);
    }
    return Array.from(map.entries())
      .sort((a, b) => b[1].revenue - a[1].revenue)
      .slice(0, 10)
      .map(([city, r]) => [
        city,
        r.country || "—",
        String(r.orders),
        fmtDecimal(r.revenue, currency),
      ]);
  }, [purchases, currency]);

  // ── Chart ──
  const chartData = useMemo(() => {
    const map = new Map<string, { label: string; revenue: number; spend: number }>();
    for (let i = windowDays - 1; i >= 0; i--) {
      const d = new Date(data.nowMs);
      d.setUTCDate(d.getUTCDate() - i);
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
  const hasGoogleData = googleSpend > 0;

  const topGoogleCampaign = useMemo(() => {
    const map = new Map<string, { name: string; orders: number; revenue: number }>();
    for (const p of purchases) {
      if (normalizeSource(p) !== "google") continue;
      const campaign = String((p as any).utmCampaign || "").trim() || "(not set)";
      const cur = map.get(campaign) || { name: campaign, orders: 0, revenue: 0 };
      cur.orders++;
      cur.revenue += safeNum((p as any).totalValue);
      map.set(campaign, cur);
    }
    const rows = Array.from(map.values()).filter((c) => c.revenue > 0);
    if (!rows.length) return null;
    return rows.sort((a, b) => b.revenue - a.revenue)[0];
  }, [purchases]);
  const hasSpend = totalSpend > 0;

  return (
    <Page
      fullWidth
      title="Analytics"
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

        {/* ── Revenue & Spend chart ── */}
        <Card>
          <BlockStack gap="300">
            <InlineStack align="space-between" blockAlign="center">
              <Text as="h2" variant="headingMd">Revenue vs spend — last {window} days</Text>
              <InlineStack gap="300" blockAlign="center">
                <InlineStack gap="100" blockAlign="center">
                  <div style={{ width: 10, height: 10, borderRadius: 99, background: "#6366f1" }} />
                  <Text as="span" variant="bodySm" tone="subdued">Revenue</Text>
                </InlineStack>
                <InlineStack gap="100" blockAlign="center">
                  <div style={{ width: 10, height: 10, borderRadius: 99, background: "#38bdf8" }} />
                  <Text as="span" variant="bodySm" tone="subdued">Spend</Text>
                </InlineStack>
              </InlineStack>
            </InlineStack>
            <BarChart data={chartData} />
          </BlockStack>
        </Card>

        {/* ── KPI row ── */}
        <Text as="p" variant="bodySm" tone="subdued" fontWeight="semibold">METRICS FROM ADVERTISING PLATFORMS</Text>
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
              <Text as="p" variant="bodySm" tone="subdued" fontWeight="semibold">BEST META ADS</Text>
              <Grid>
                <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 6, xl: 6 }}>
                  {topCampaign ? (
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
                  ) : (
                    <Box background="bg-surface-secondary" padding="400" borderRadius="200">
                      <BlockStack gap="100">
                        <Badge tone="info">🏆 Best campaign</Badge>
                        <Text as="p" variant="headingMd" tone="subdued">No campaign data yet</Text>
                        <Text as="p" variant="bodySm" tone="subdued">Run a sync from Integrations → Meta to see your top campaign here.</Text>
                      </BlockStack>
                    </Box>
                  )}
                </Grid.Cell>

                <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 6, xl: 6 }}>
                  {topAd ? (
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
                  ) : (
                    <Box background="bg-surface-secondary" padding="400" borderRadius="200">
                      <BlockStack gap="100">
                        <Badge tone="info">🏆 Best ad</Badge>
                        <Text as="p" variant="headingMd" tone="subdued">No ad data yet</Text>
                        <Text as="p" variant="bodySm" tone="subdued">Go to Integrations → Meta and run a sync to see your best-performing ad here.</Text>
                      </BlockStack>
                    </Box>
                  )}
                </Grid.Cell>
              </Grid>
              <InlineStack align="center">
                <Button url="/app/meta-ads" variant="primary" size="large">See detailed Meta Ads performance →</Button>
              </InlineStack>

            </BlockStack>
          </Card>
        )}

        {!hasMetaData && (
          <Card>
            <BlockStack gap="200">
              <Text as="h2" variant="headingMd">Meta Ads Manager</Text>
              <Text as="p" tone="subdued">
                {data.metaConnected
                  ? data.metaLastSyncedAt
                    ? `No campaign data found for this period. Meta syncs automatically every 24h — last synced ${new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(new Date(data.metaLastSyncedAt))}.`
                    : "Meta is connected. A sync will run automatically within the next 24 hours."
                  : <>
                      Connect your Meta ad account in{" "}
                      <Button url="/app/ads" variant="plain">Integrations</Button>{" "}
                      to see campaign-level spend, ROAS, and CPA here. Data syncs automatically every 24h.
                    </>
                }
              </Text>
            </BlockStack>
          </Card>
        )}

        {/* ── Google Ads section ── */}
        {hasGoogleData && (
          <Card>
            <BlockStack gap="400">
              <InlineStack align="space-between" blockAlign="center">
                <BlockStack gap="100">
                  <Text as="h2" variant="headingMd">Google Ads</Text>
                  <Text as="p" variant="bodySm" tone="subdued">
                    Google-attributed performance — last {window} days
                  </Text>
                </BlockStack>
                <Badge tone="success">Ads data</Badge>
              </InlineStack>

              <Grid>
                <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 3, xl: 3 }}>
                  <Box background="bg-surface-secondary" padding="400" borderRadius="200">
                    <BlockStack gap="100">
                      <Text as="p" variant="bodySm" tone="subdued">Google spend</Text>
                      <Text as="p" variant="headingXl">{fmtDecimal(googleSpend, currency)}</Text>
                    </BlockStack>
                  </Box>
                </Grid.Cell>
                <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 3, xl: 3 }}>
                  <Box background="bg-surface-secondary" padding="400" borderRadius="200">
                    <BlockStack gap="100">
                      <Text as="p" variant="bodySm" tone="subdued">Attributed orders</Text>
                      <Text as="p" variant="headingXl">{String(purchases.filter((p: any) => normalizeSource(p) === "google").length)}</Text>
                    </BlockStack>
                  </Box>
                </Grid.Cell>
                <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 3, xl: 3 }}>
                  <Box background="bg-surface-secondary" padding="400" borderRadius="200">
                    <BlockStack gap="100">
                      <Text as="p" variant="bodySm" tone="subdued">Attributed revenue</Text>
                      <Text as="p" variant="headingXl">{fmtDecimal(purchases.filter((p: any) => normalizeSource(p) === "google").reduce((s: number, p: any) => s + safeNum(p.totalValue), 0), currency)}</Text>
                    </BlockStack>
                  </Box>
                </Grid.Cell>
                <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 3, xl: 3 }}>
                  <Box background="bg-surface-secondary" padding="400" borderRadius="200">
                    <BlockStack gap="100">
                      <Text as="p" variant="bodySm" tone="subdued">Google ROAS (attributed)</Text>
                      <Text as="p" variant="headingXl">{googleSpend > 0 ? (purchases.filter((p: any) => normalizeSource(p) === "google").reduce((s: number, p: any) => s + safeNum(p.totalValue), 0) / googleSpend).toFixed(2) + "×" : "—"}</Text>
                    </BlockStack>
                  </Box>
                </Grid.Cell>
              </Grid>

              <Divider />

              <Grid>
                <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 6, xl: 6 }}>
                  {topGoogleCampaign ? (
                    <Box background="bg-surface-success" padding="400" borderRadius="200">
                      <BlockStack gap="100">
                        <InlineStack gap="200" blockAlign="center">
                          <Badge tone="success">🏆 Best campaign</Badge>
                        </InlineStack>
                        <Text as="p" variant="headingMd">{topGoogleCampaign.name}</Text>
                        <InlineStack gap="400">
                          <Text as="p" variant="bodySm" tone="subdued">Orders: <Text as="span" fontWeight="bold">{topGoogleCampaign.orders}</Text></Text>
                          <Text as="p" variant="bodySm" tone="subdued">Revenue: <Text as="span" fontWeight="bold">{fmtDecimal(topGoogleCampaign.revenue, currency)}</Text></Text>
                        </InlineStack>
                      </BlockStack>
                    </Box>
                  ) : (
                    <Box background="bg-surface-secondary" padding="400" borderRadius="200">
                      <BlockStack gap="100">
                        <InlineStack gap="200" blockAlign="center">
                          <Badge tone="info">🏆 Best campaign</Badge>
                        </InlineStack>
                        <Text as="p" variant="headingMd" tone="subdued">No campaign data</Text>
                        <Text as="p" variant="bodySm" tone="subdued">Orders are missing UTM campaign tags. Make sure your Google Ads URLs include utm_source=google&utm_campaign=...</Text>
                      </BlockStack>
                    </Box>
                  )}
                </Grid.Cell>
                <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 6, xl: 6 }}>
                  <Box background="bg-surface-secondary" padding="400" borderRadius="200">
                    <BlockStack gap="100">
                      <InlineStack gap="200" blockAlign="center">
                        <Badge tone="info">🏆 Best ad</Badge>
                      </InlineStack>
                      <Text as="p" variant="headingMd" tone="subdued">Pending Google API</Text>
                      <Text as="p" variant="bodySm" tone="subdued">Ad-level data will appear once Google Ads API access is approved.</Text>
                    </BlockStack>
                  </Box>
                </Grid.Cell>
              </Grid>
            </BlockStack>
          </Card>
        )}

        {/* ── Revenue health & stage ── */}
        <Card>
          <BlockStack gap="400">
            {/* Header */}
            <InlineStack align="space-between" blockAlign="center">
              <BlockStack gap="050">
                <Text as="h2" variant="headingMd">Revenue health</Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  Channel mix vs benchmarks — last {window} days
                </Text>
              </BlockStack>
              {(() => {
                const stage = detectStage(healthBreakdown.ads.pct, healthBreakdown.email.pct);
                return (
                  <span style={{
                    fontSize: 13, fontWeight: 700,
                    background: stage.bg, color: stage.text,
                    border: `1.5px solid ${stage.border}`,
                    borderRadius: 20, padding: "4px 14px",
                  }}>
                    {stage.emoji} {stage.label}
                  </span>
                );
              })()}
            </InlineStack>

            {/* Channel rows */}
            {(() => {
              const stage = detectStage(healthBreakdown.ads.pct, healthBreakdown.email.pct);

              // Benchmark targets (what GOOD looks like)
              const BENCHMARK = { ads: 60, email: 25, organic: 25 };

              const rows: Array<{
                key: "ads" | "email" | "organic";
                label: string;
                icon: string;
                pct: number;
                value: number;
                targetLabel: string;
                goodMin: number;
                goodMax: number;
                barColor: string;
              }> = [
                {
                  key: "ads",
                  label: "Paid ads",
                  icon: "📢",
                  pct: healthBreakdown.ads.pct,
                  value: healthBreakdown.ads.value,
                  targetLabel: `Target: max ${BENCHMARK.ads}%`,
                  goodMin: 0,
                  goodMax: 60,
                  barColor: "#6366f1",
                },
                {
                  key: "organic",
                  label: "Direct / Organic",
                  icon: "🌱",
                  pct: healthBreakdown.organic.pct,
                  value: healthBreakdown.organic.value,
                  targetLabel: `Target: ${BENCHMARK.organic}–30%`,
                  goodMin: 20,
                  goodMax: 40,
                  barColor: "#10b981",
                },
                {
                  key: "email",
                  label: "Email / Newsletter",
                  icon: "📧",
                  pct: healthBreakdown.email.pct,
                  value: healthBreakdown.email.value,
                  targetLabel: `Target: 20–30%`,
                  goodMin: 20,
                  goodMax: 30,
                  barColor: "#f59e0b",
                },
              ];

              return (
                <BlockStack gap="300">
                  {rows.map((row) => {
                    // Status: for ads, lower is better; for email/organic, higher is better
                    let statusIcon = "✓";
                    let statusColor = "#16a34a";
                    let statusText = "On target";
                    if (row.key === "ads") {
                      if (row.pct > 70) { statusIcon = "⚠️"; statusColor = "#dc2626"; statusText = "Too high"; }
                      else if (row.pct > 60) { statusIcon = "🟡"; statusColor = "#d97706"; statusText = "Slightly high"; }
                    } else {
                      if (row.pct < row.goodMin) { statusIcon = "📈"; statusColor = "#d97706"; statusText = "Too low"; }
                      else if (row.pct > row.goodMax) { statusIcon = "✓"; statusColor = "#16a34a"; statusText = "Great"; }
                    }
                    if (row.pct === 0 && row.key !== "ads") { statusIcon = "📈"; statusColor = "#9ca3af"; statusText = "Not started"; }

                    return (
                      <div key={row.key} style={{ display: "grid", gridTemplateColumns: "180px 1fr auto", gap: "0 20px", alignItems: "center" }}>
                        {/* Label + % */}
                        <div>
                          <InlineStack gap="150" blockAlign="center">
                            <span style={{ fontSize: 16 }}>{row.icon}</span>
                            <Text as="p" variant="bodyMd" fontWeight="semibold">{row.label}</Text>
                          </InlineStack>
                          <div style={{ marginTop: 2 }}>
                            <Text as="p" variant="headingLg">{row.pct}%</Text>
                          </div>
                          <Text as="p" variant="bodySm" tone="subdued">{fmtDecimal(row.value, currency)}</Text>
                        </div>
                        {/* Bar + target */}
                        <div>
                          {/* Actual bar */}
                          <div style={{ width: "100%", height: 10, background: "#f1f2f3", borderRadius: 99, position: "relative" }}>
                            <div style={{
                              width: `${row.pct}%`, height: "100%",
                              background: row.barColor,
                              borderRadius: 99,
                              transition: "width 0.4s",
                            }} />
                            {/* Target marker line */}
                            <div style={{
                              position: "absolute",
                              top: -3, bottom: -3,
                              left: `${Math.min(BENCHMARK.ads === 60 && row.key === "ads" ? 60 : row.goodMin, 99)}%`,
                              width: 2,
                              background: "#374151",
                              borderRadius: 2,
                              opacity: 0.4,
                            }} />
                          </div>
                          <Text as="p" variant="bodySm" tone="subdued">{row.targetLabel} · {stage[row.key === "ads" ? "adTarget" : row.key === "email" ? "emailTarget" : "organicTarget"]}</Text>
                        </div>
                        {/* Status */}
                        <div style={{ textAlign: "right" }}>
                          <span style={{ fontSize: 13, fontWeight: 700, color: statusColor }}>{statusIcon} {statusText}</span>
                        </div>
                      </div>
                    );
                  })}
                </BlockStack>
              );
            })()}

            {/* Stage callout */}
            {(() => {
              const stage = detectStage(healthBreakdown.ads.pct, healthBreakdown.email.pct);
              return (
                <div style={{ background: stage.bg, border: `1px solid ${stage.border}`, borderRadius: 10, padding: "14px 18px" }}>
                  <InlineStack gap="300" blockAlign="start">
                    <span style={{ fontSize: 22 }}>{stage.emoji}</span>
                    <BlockStack gap="050">
                      <Text as="p" variant="bodyMd" fontWeight="semibold" >{stage.label} · {stage.range}</Text>
                      <Text as="p" variant="bodySm">{stage.advice}</Text>
                    </BlockStack>
                  </InlineStack>
                </div>
              );
            })()}

            {/* Benchmark footer */}
            <div style={{ borderTop: "1px solid #e5e7eb", paddingTop: 12 }}>
              <Text as="p" variant="bodySm" tone="subdued" fontWeight="semibold">🔥 What GOOD looks like</Text>
              <div style={{ display: "flex", gap: 24, marginTop: 8, flexWrap: "wrap" }}>
                {[
                  { label: "Ads", target: "max 60%", color: "#6366f1" },
                  { label: "Email", target: "20–30%", color: "#f59e0b" },
                  { label: "Direct / Organic", target: "20–30%", color: "#10b981" },
                ].map((b) => (
                  <InlineStack key={b.label} gap="150" blockAlign="center">
                    <div style={{ width: 10, height: 10, borderRadius: 99, background: b.color }} />
                    <Text as="span" variant="bodySm"><strong>{b.label}</strong> → {b.target}</Text>
                  </InlineStack>
                ))}
              </div>
            </div>
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

        {/* ── Customers by location ── */}
        <Card>
          <BlockStack gap="400">
            <BlockStack gap="100">
              <Text as="h2" variant="headingMd">Customers by location</Text>
              <Text as="p" variant="bodySm" tone="subdued">Attributed orders by country and city — last {window} days</Text>
            </BlockStack>

            {countryRows.length > 0 ? (
              <BlockStack gap="300">
                <Text as="h3" variant="headingSm">By country</Text>
                <DataTable
                  columnContentTypes={["text", "numeric", "numeric", "text"]}
                  headings={["Country", "Orders", "Revenue", "Share"]}
                  rows={countryRows}
                  increasedTableDensity
                />
              </BlockStack>
            ) : (
              <BlockStack gap="300">
                <Text as="p" tone="subdued">No location data yet. New orders will include country and city automatically.</Text>
                <InlineStack gap="300" blockAlign="center">
                  <locationBackfill.Form method="post" action="/api/backfill/locations">
                    <Button
                      submit
                      loading={locationBackfill.state !== "idle"}
                      disabled={locationBackfill.state !== "idle"}
                    >
                      Backfill location data from existing orders
                    </Button>
                  </locationBackfill.Form>
                  {locationBackfill.data && (
                    <Text as="p" variant="bodySm" tone={locationBackfill.data.ok ? "success" : "critical"}>
                      {locationBackfill.data.message ??
                        `Updated ${locationBackfill.data.updated} of ${locationBackfill.data.total} orders.`}
                    </Text>
                  )}
                </InlineStack>
              </BlockStack>
            )}

            {cityRows.length > 0 && (
              <BlockStack gap="300">
                <Text as="h3" variant="headingSm">Top cities</Text>
                <DataTable
                  columnContentTypes={["text", "text", "numeric", "numeric"]}
                  headings={["City", "Country", "Orders", "Revenue"]}
                  rows={cityRows}
                  increasedTableDensity
                />
              </BlockStack>
            )}
          </BlockStack>
        </Card>

      </BlockStack>
    </Page>
  );
}
