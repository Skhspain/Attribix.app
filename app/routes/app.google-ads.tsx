// app/routes/app.google-ads.tsx
import { json, type LoaderFunctionArgs, type ActionFunctionArgs } from "@remix-run/node";
import { useLoaderData, useFetcher } from "@remix-run/react";
import { useMemo, useState } from "react";
import {
  Badge,
  BlockStack,
  Button,
  Card,
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

  const since90 = new Date();
  since90.setUTCDate(since90.getUTCDate() - 90);
  since90.setUTCHours(0, 0, 0, 0);

  const [campaigns, conn] = await Promise.all([
    anyDb.googleCampaignDailyInsight?.findMany?.({
      where: { shop, date: { gte: since90 } },
      select: {
        campaignId: true, campaignName: true,
        spend: true, impressions: true, clicks: true,
        conversions: true, conversionValue: true, date: true,
      },
      orderBy: { date: "desc" },
    }).catch(() => []),
    db.googleConnection.findUnique({
      where: { shop },
      select: { adCustomerId: true, lastSyncedAt: true },
    }).catch(() => null),
  ]);

  return json({
    shop,
    nowMs: Date.now(),
    campaigns: campaigns ?? [],
    adCustomerId: conn?.adCustomerId ?? null,
    lastSyncedAt: conn?.lastSyncedAt ?? null,
  });
}

// ─── Action (manual sync trigger) ────────────────────────────────────────────

export async function action({ request }: ActionFunctionArgs) {
  const { authenticate } = await import("../shopify.server");
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const conn = await db.googleConnection
    .findUnique({ where: { shop } })
    .catch(() => null);

  if (!conn?.accessToken || conn.accessToken === "__PENDING__" || !conn.adCustomerId) {
    return json({ ok: false, error: "Google Ads not fully connected" }, { status: 400 });
  }

  const { syncGoogleSpendDaily } = await import("../services/googleAds.server");
  const result = await syncGoogleSpendDaily({
    shop,
    accessToken: conn.accessToken,
    customerId: conn.adCustomerId,
    days: 90,
  });

  return json({ ok: true, result });
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function safeNum(v: unknown) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function fmt(value: number) {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "NOK", maximumFractionDigits: 0 }).format(value || 0);
  } catch {
    return `NOK ${Number(value || 0).toFixed(0)}`;
  }
}

function fmtDec(value: number) {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "NOK", maximumFractionDigits: 2 }).format(value || 0);
  } catch {
    return `NOK ${Number(value || 0).toFixed(2)}`;
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

function fmtSyncDate(iso: string | null) {
  if (!iso) return null;
  try {
    return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(new Date(iso));
  } catch { return null; }
}

// ─── Bar chart ────────────────────────────────────────────────────────────────

function BarChart({ data }: { data: Array<{ label: string; revenue: number; spend: number }> }) {
  const maxVal = Math.max(1, ...data.flatMap((d) => [d.revenue, d.spend]));
  const showEvery = Math.ceil(data.length / 10);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; label: string; revenue: number; spend: number } | null>(null);

  return (
    <div style={{ width: "100%", overflowX: "auto", position: "relative" }}>
      {tooltip && (
        <div style={{
          position: "fixed", left: tooltip.x + 12, top: tooltip.y - 10,
          background: "#1f2937", color: "#fff", borderRadius: 8, padding: "8px 12px",
          fontSize: 12, pointerEvents: "none", zIndex: 9999, whiteSpace: "nowrap",
          boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
        }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>{tooltip.label}</div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#22c55e", display: "inline-block" }} />
            Conversion value: {tooltip.revenue.toLocaleString("en-US", { maximumFractionDigits: 0 })}
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 2 }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#38bdf8", display: "inline-block" }} />
            Spend: {tooltip.spend.toLocaleString("en-US", { maximumFractionDigits: 0 })}
          </div>
        </div>
      )}
      <div style={{
        display: "grid", gridTemplateColumns: `repeat(${data.length}, minmax(0, 1fr))`,
        gap: 3, alignItems: "end", minHeight: 200, minWidth: data.length * 24,
      }}>
        {data.map((row, i) => (
          <div key={row.label}
            onMouseMove={(e) => setTooltip({ x: e.clientX, y: e.clientY, ...row })}
            onMouseLeave={() => setTooltip(null)}
            style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "end", cursor: "default" }}
          >
            <div style={{ width: "100%", height: 160, display: "flex", alignItems: "end", justifyContent: "center", gap: 2 }}>
              <div style={{ width: "44%", minHeight: 2, height: `${(row.revenue / maxVal) * 100}%`, borderRadius: "3px 3px 0 0", background: "linear-gradient(180deg, #4ade80 0%, #22c55e 100%)" }} />
              <div style={{ width: "44%", minHeight: 2, height: `${(row.spend / maxVal) * 100}%`, borderRadius: "3px 3px 0 0", background: "linear-gradient(180deg, #7dd3fc 0%, #38bdf8 100%)" }} />
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

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function GoogleAdsDetail() {
  const data = useLoaderData<typeof loader>();
  const syncFetcher = useFetcher<{ ok: boolean; result?: any; error?: string }>();

  const [window, setWindow] = useState<"7" | "14" | "30" | "90">("30");
  const [showTargets, setShowTargets] = useState(false);
  const [targetRoas, setTargetRoas] = useState<string>("3");
  const windowDays = Number(window);

  const isSyncing = syncFetcher.state !== "idle";
  const syncResult = syncFetcher.data;

  const windowCutoff = useMemo(() => {
    const d = new Date(data.nowMs);
    d.setUTCDate(d.getUTCDate() - windowDays);
    d.setUTCHours(0, 0, 0, 0);
    return d;
  }, [windowDays, data.nowMs]);

  const campaigns = useMemo(
    () => (data.campaigns as any[]).filter((r) => new Date(r.date) >= windowCutoff),
    [data.campaigns, windowCutoff]
  );

  // KPIs
  const kpis = useMemo(() => {
    let spend = 0, impressions = 0, clicks = 0, conversions = 0, value = 0;
    for (const r of campaigns) {
      spend += safeNum(r.spend);
      impressions += safeNum(r.impressions);
      clicks += safeNum(r.clicks);
      conversions += safeNum(r.conversions);
      value += safeNum(r.conversionValue);
    }
    return {
      spend, impressions, clicks, conversions, value,
      roas: spend > 0 ? value / spend : null,
      ctr: impressions > 0 ? (clicks / impressions) * 100 : null,
      cpc: clicks > 0 ? spend / clicks : null,
      cpa: conversions > 0 ? spend / conversions : null,
    };
  }, [campaigns]);

  // Chart data
  const chartData = useMemo(() => {
    const map = new Map<string, { label: string; revenue: number; spend: number }>();
    for (let i = windowDays - 1; i >= 0; i--) {
      const d = new Date(data.nowMs);
      d.setUTCDate(d.getUTCDate() - i);
      const k = d.toISOString().slice(0, 10);
      map.set(k, { label: labelShort(k), revenue: 0, spend: 0 });
    }
    for (const r of campaigns) {
      const k = dayKey(r.date);
      const cur = map.get(k);
      if (cur) {
        cur.spend += safeNum(r.spend);
        cur.revenue += safeNum(r.conversionValue);
      }
    }
    return Array.from(map.values());
  }, [campaigns, windowDays, data.nowMs]);

  // Campaign table data — aggregated by campaign
  const campaignTableData = useMemo(() => {
    const map = new Map<string, {
      id: string; name: string;
      spend: number; impressions: number; clicks: number;
      conversions: number; value: number;
    }>();
    for (const r of campaigns) {
      const id = String(r.campaignId);
      const cur = map.get(id) || { id, name: r.campaignName || id, spend: 0, impressions: 0, clicks: 0, conversions: 0, value: 0 };
      cur.spend += safeNum(r.spend);
      cur.impressions += safeNum(r.impressions);
      cur.clicks += safeNum(r.clicks);
      cur.conversions += safeNum(r.conversions);
      cur.value += safeNum(r.conversionValue);
      map.set(id, cur);
    }
    return Array.from(map.values())
      .sort((a, b) => b.spend - a.spend)
      .map((c, i) => {
        const roas = c.spend > 0 ? c.value / c.spend : null;
        const ctr = c.impressions > 0 ? (c.clicks / c.impressions) * 100 : null;
        const cpc = c.clicks > 0 ? c.spend / c.clicks : null;
        const cpa = c.conversions > 0 ? c.spend / c.conversions : null;
        const profit = c.value - c.spend;
        const roasTarget = parseFloat(targetRoas) || null;
        const hitRoas = roasTarget && roas !== null && roas >= roasTarget;
        const roasPct = roasTarget && roas !== null ? Math.min(Math.round((roas / roasTarget) * 100), 100) : null;

        return { rank: i + 1, ...c, roas, ctr, cpc, cpa, profit, hitRoas, roasPct };
      });
  }, [campaigns, targetRoas]);

  const hasData = campaignTableData.length > 0;
  const isConnected = !!data.adCustomerId;

  return (
    <Page
      fullWidth
      title="Google Ads — Campaign Performance"
      subtitle={`Last ${window} days · Shop: ${data.shop}`}
      backAction={{ url: "/app/analytics", content: "Analytics" }}
      primaryAction={
        <Select
          label=""
          labelHidden
          options={[
            { label: "Last 7 days", value: "7" },
            { label: "Last 14 days", value: "14" },
            { label: "Last 30 days", value: "30" },
            { label: "Last 90 days", value: "90" },
          ]}
          value={window}
          onChange={(v) => setWindow(v as any)}
        />
      }
    >
      <BlockStack gap="600">

        {/* Not connected state */}
        {!isConnected && (
          <Card>
            <BlockStack gap="300">
              <InlineStack gap="200" blockAlign="center">
                <Text as="h2" variant="headingMd">Google Ads not connected</Text>
                <Badge tone="warning">Not connected</Badge>
              </InlineStack>
              <Text as="p" tone="subdued">
                Connect your Google Ads account in Integrations to start syncing campaign spend, clicks, and conversions.
              </Text>
              <Button url="/app/integrations/google" variant="primary">Connect Google Ads</Button>
            </BlockStack>
          </Card>
        )}

        {/* KPIs */}
        {isConnected && (
          <Grid>
            {[
              { label: "Total spend", value: fmt(kpis.spend) },
              { label: "Clicks", value: kpis.clicks.toLocaleString("en-US"), sub: kpis.ctr ? `CTR ${kpis.ctr.toFixed(2)}%` : undefined },
              { label: "Conversions", value: kpis.conversions.toLocaleString("en-US"), sub: kpis.cpa ? `CPA ${fmtDec(kpis.cpa)}` : undefined },
              { label: "ROAS (Google reported)", value: kpis.roas ? kpis.roas.toFixed(2) + "×" : "—", sub: `${fmt(kpis.value)} conversion value` },
            ].map((kpi) => (
              <Grid.Cell key={kpi.label} columnSpan={{ xs: 6, sm: 3, md: 3, lg: 3, xl: 3 }}>
                <Card>
                  <BlockStack gap="100">
                    <Text as="p" variant="bodySm" tone="subdued">{kpi.label}</Text>
                    <Text as="p" variant="heading2xl">{kpi.value}</Text>
                    {kpi.sub && <Text as="p" variant="bodySm" tone="subdued">{kpi.sub}</Text>}
                  </BlockStack>
                </Card>
              </Grid.Cell>
            ))}
          </Grid>
        )}

        {/* Chart */}
        {isConnected && (
          <Card>
            <BlockStack gap="300">
              <InlineStack align="space-between" blockAlign="center">
                <Text as="h2" variant="headingMd">Daily spend vs conversion value</Text>
                <InlineStack gap="300" blockAlign="center">
                  <InlineStack gap="100" blockAlign="center">
                    <div style={{ width: 10, height: 10, borderRadius: 99, background: "#22c55e" }} />
                    <Text as="span" variant="bodySm" tone="subdued">Conversion value</Text>
                  </InlineStack>
                  <InlineStack gap="100" blockAlign="center">
                    <div style={{ width: 10, height: 10, borderRadius: 99, background: "#38bdf8" }} />
                    <Text as="span" variant="bodySm" tone="subdued">Spend</Text>
                  </InlineStack>
                </InlineStack>
              </InlineStack>
              {chartData.some(d => d.spend > 0 || d.revenue > 0)
                ? <BarChart data={chartData} />
                : <Text as="p" tone="subdued">No data for this period. Run a sync to pull the latest data.</Text>
              }
            </BlockStack>
          </Card>
        )}

        {/* Campaign table with ROAS target */}
        {isConnected && (
          <div style={{ borderRadius: 16, overflow: "hidden", boxShadow: "0 1px 4px rgba(0,0,0,0.08)", border: "1px solid #e1e3e5" }}>

            {/* Target banner */}
            {!showTargets ? (
              <div style={{
                background: "#fff8f0", borderBottom: "1px solid #f0e0c8",
                padding: "16px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16,
              }}>
                <div>
                  <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: "#92400e", textTransform: "uppercase", letterSpacing: "0.06em" }}>⚠️ No ROAS target set</p>
                  <p style={{ margin: 0, fontSize: 14, color: "#78350f", marginTop: 3 }}>Set your target to see which campaigns are actually profitable.</p>
                </div>
                <button onClick={() => setShowTargets(true)} style={{
                  background: "#f59e0b", color: "#fff", border: "none",
                  borderRadius: 8, padding: "10px 20px", fontWeight: 700, fontSize: 14,
                  cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0,
                  boxShadow: "0 1px 4px rgba(0,0,0,0.15)",
                }}>
                  👉 Set your ROAS target
                </button>
              </div>
            ) : (
              <div style={{
                background: "#f0fdf4", borderBottom: "1px solid #bbf7d0",
                padding: "16px 24px", display: "flex", alignItems: "center", gap: 24, flexWrap: "wrap",
              }}>
                <div>
                  <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: "#166534", textTransform: "uppercase", letterSpacing: "0.06em" }}>🎯 ROAS Target</p>
                  <p style={{ margin: 0, fontSize: 13, color: "#166534", marginTop: 2 }}>Campaigns hitting this ROAS are profitable. Scale those, pause the rest.</p>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
                  <label style={{ fontSize: 14, fontWeight: 600, color: "#166534" }}>Target ROAS</label>
                  <input
                    type="number" min="0.1" step="0.1"
                    value={targetRoas}
                    onChange={(e) => setTargetRoas(e.target.value)}
                    style={{ width: 72, padding: "6px 10px", borderRadius: 6, border: "1px solid #86efac", fontSize: 14, fontWeight: 700, color: "#166534", background: "#fff" }}
                  />
                  <span style={{ fontSize: 14, color: "#166534" }}>×</span>
                  <button onClick={() => setShowTargets(false)} style={{ background: "none", border: "none", color: "#6b7280", cursor: "pointer", fontSize: 20, padding: "0 4px" }}>×</button>
                </div>
              </div>
            )}

            {/* Table header */}
            <div style={{ padding: "16px 24px 8px", background: "#fff" }}>
              <InlineStack align="space-between" blockAlign="center">
                <Text as="h2" variant="headingMd">Campaign breakdown</Text>
                <InlineStack gap="200" blockAlign="center">
                  {data.lastSyncedAt && (
                    <Text as="p" variant="bodySm" tone="subdued">
                      Last synced {fmtSyncDate(data.lastSyncedAt as any)}
                    </Text>
                  )}
                  <syncFetcher.Form method="post">
                    <Button submit loading={isSyncing} size="slim">
                      {isSyncing ? "Syncing…" : "Sync now"}
                    </Button>
                  </syncFetcher.Form>
                </InlineStack>
              </InlineStack>
              {syncResult?.ok && (
                <div style={{ marginTop: 8, padding: "8px 12px", background: "#f0fdf4", borderRadius: 6, fontSize: 13, color: "#166534" }}>
                  ✅ Synced {syncResult.result?.upserted ?? 0} rows from Google Ads
                </div>
              )}
              {syncResult?.error && (
                <div style={{ marginTop: 8, padding: "8px 12px", background: "#fff1f2", borderRadius: 6, fontSize: 13, color: "#be123c" }}>
                  ❌ {syncResult.error}
                </div>
              )}
            </div>

            {/* Summary bar */}
            {hasData && (() => {
              const roasTarget = parseFloat(targetRoas) || null;
              const hitting = roasTarget
                ? campaignTableData.filter(c => c.roas !== null && c.roas >= roasTarget).length
                : campaignTableData.filter(c => c.roas !== null && c.roas >= 3).length;
              const losing = campaignTableData.filter(c => c.roas !== null && c.roas < 1).length;
              const profitableSpend = campaignTableData.filter(c => roasTarget ? (c.roas !== null && c.roas >= roasTarget) : (c.roas !== null && c.roas >= 3)).reduce((s, c) => s + c.spend, 0);
              const totalSpend = campaignTableData.reduce((s, c) => s + c.spend, 0);
              const profitPct = totalSpend > 0 ? Math.round((profitableSpend / totalSpend) * 100) : 0;
              return (
                <div style={{ display: "flex", gap: 12, flexWrap: "wrap", padding: "8px 24px 12px", background: "#fff" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#22c55e", display: "inline-block" }} />
                    <p style={{ margin: 0, fontSize: 13, color: "#111827" }}><strong>{hitting}</strong> of {campaignTableData.length} campaigns hitting target</p>
                  </div>
                  <span style={{ color: "#d1d5db", fontSize: 13 }}>·</span>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#f59e0b", display: "inline-block" }} />
                    <p style={{ margin: 0, fontSize: 13, color: "#111827" }}><strong>{profitPct}%</strong> of spend is profitable</p>
                  </div>
                  {losing > 0 && <>
                    <span style={{ color: "#d1d5db", fontSize: 13 }}>·</span>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#ef4444", display: "inline-block" }} />
                      <p style={{ margin: 0, fontSize: 13, color: "#111827" }}><strong>{losing}</strong> campaigns losing money</p>
                    </div>
                  </>}
                </div>
              );
            })()}

            {/* Column headers */}
            {hasData && (
              <div style={{ padding: "0 24px" }}>
                <div style={{ display: "grid", gridTemplateColumns: "28px 1fr 110px 110px 110px 80px 70px 1fr", gap: "0 12px", padding: "6px 0 10px", borderBottom: "1px solid #e1e3e5" }}>
                  {["#", "Campaign", "You spent", "You made", "Profit/loss", "Sales", "CPC", "Performance vs target"].map(h => (
                    <p key={h} style={{ margin: 0, fontSize: 12, fontWeight: 600, color: "#6b7280" }}>{h}</p>
                  ))}
                </div>

                {campaignTableData.map((c) => {
                  const roasTarget = parseFloat(targetRoas) || null;
                  const hitRoas = roasTarget && c.roas !== null && c.roas >= roasTarget;
                  const roasPct = roasTarget && c.roas !== null ? Math.min(Math.round((c.roas / roasTarget) * 100), 100) : null;
                  let targetNote = "";
                  if (roasTarget && c.roas !== null) {
                    targetNote = hitRoas
                      ? `✅ ROAS target hit! (${c.roas.toFixed(2)}× / ${roasTarget}×)`
                      : `${c.roas.toFixed(2)}× of ${roasTarget}× target`;
                  } else if (c.roas !== null) {
                    targetNote = `${c.roas.toFixed(2)}× ROAS`;
                  } else {
                    targetNote = c.conversions > 0 ? `${c.conversions.toFixed(1)} conversions` : "No conversions tracked";
                  }

                  const rowBg = (hitRoas || (c.roas !== null && c.roas >= 3 && !roasTarget))
                    ? "#f0fdf4"
                    : (c.roas !== null && c.roas < 1)
                      ? "#fff8f8"
                      : "#fff";

                  return (
                    <div key={c.id} style={{
                      display: "grid", gridTemplateColumns: "28px 1fr 110px 110px 110px 80px 70px 1fr",
                      gap: "0 12px", alignItems: "center", padding: "13px 0",
                      borderBottom: "1px solid #f1f2f3", background: rowBg,
                    }}>
                      <Text as="p" variant="bodySm" tone="subdued">{c.rank}</Text>
                      <BlockStack gap="0">
                        <Text as="p" variant="bodySm" fontWeight="semibold">{c.name}</Text>
                        {c.ctr !== null && (
                          <Text as="p" variant="bodySm" tone="subdued">
                            {c.impressions.toLocaleString("en-US")} impr · {c.clicks.toLocaleString("en-US")} clicks · CTR {c.ctr.toFixed(2)}%
                          </Text>
                        )}
                      </BlockStack>
                      <Text as="p" variant="bodySm">{fmtDec(c.spend)}</Text>
                      <Text as="p" variant="bodySm" fontWeight="semibold">{fmtDec(c.value)}</Text>
                      <Text as="p" variant="bodySm" fontWeight="semibold" tone={c.profit >= 0 ? "success" : "critical"}>
                        {c.profit >= 0 ? "+" : ""}{fmtDec(c.profit)}
                      </Text>
                      <Text as="p" variant="bodySm">{c.conversions > 0 ? c.conversions.toFixed(1) : "—"}</Text>
                      <Text as="p" variant="bodySm">{c.cpc ? fmtDec(c.cpc) : "—"}</Text>
                      <BlockStack gap="050">
                        <Text as="p" variant="bodySm" fontWeight="semibold">{targetNote}</Text>
                        {roasTarget && c.roas !== null && (
                          <div style={{ width: "100%", height: 6, background: "#e5e7eb", borderRadius: 99 }}>
                            <div style={{ width: `${roasPct}%`, height: "100%", background: hitRoas ? "#22c55e" : "#f59e0b", borderRadius: 99 }} />
                          </div>
                        )}
                      </BlockStack>
                    </div>
                  );
                })}

                {!hasData && (
                  <div style={{ padding: "32px 0", textAlign: "center" }}>
                    <Text as="p" tone="subdued">No campaign data yet. Click "Sync now" to pull the last 90 days from Google Ads.</Text>
                  </div>
                )}
              </div>
            )}

            {!hasData && (
              <div style={{ padding: "40px 24px", textAlign: "center" }}>
                <Text as="p" tone="subdued" variant="bodyMd">No data yet. Click "Sync now" above to pull campaign data from Google Ads.</Text>
              </div>
            )}

          </div>
        )}

        {/* What to do next */}
        {hasData && (() => {
          const roasTarget = parseFloat(targetRoas) || 3;
          const scale = campaignTableData.filter(c => c.roas !== null && c.roas >= roasTarget);
          const watch = campaignTableData.filter(c => c.roas !== null && c.roas >= 1 && c.roas < roasTarget);
          const pause = campaignTableData.filter(c => c.roas !== null && c.roas < 1 && c.spend > 1);
          const noConv = campaignTableData.filter(c => c.conversions === 0 && c.spend > 5);

          if (!scale.length && !watch.length && !pause.length && !noConv.length) return null;

          return (
            <Card>
              <BlockStack gap="300">
                <Text as="p" variant="bodySm" tone="subdued" fontWeight="semibold">WHAT TO DO NEXT</Text>
                <BlockStack gap="200">
                  {scale.length > 0 && (
                    <div style={{ display: "grid", gridTemplateColumns: "36px 1fr", gap: "0 12px", alignItems: "start", background: "#f0fdf4", borderLeft: "3px solid #22c55e", borderRadius: "0 8px 8px 0", padding: "12px 14px" }}>
                      <div style={{ fontSize: 18 }}>📈</div>
                      <BlockStack gap="050">
                        <Text as="p" variant="bodyMd" fontWeight="semibold">Scale — {scale.length} campaign{scale.length > 1 ? "s" : ""} hitting your {roasTarget}× target</Text>
                        <Text as="p" variant="bodySm" tone="subdued">{scale.map(c => c.name).join(", ")} — these are working. Increase budget.</Text>
                      </BlockStack>
                    </div>
                  )}
                  {watch.length > 0 && (
                    <div style={{ display: "grid", gridTemplateColumns: "36px 1fr", gap: "0 12px", alignItems: "start", background: "#fffbeb", borderLeft: "3px solid #f59e0b", borderRadius: "0 8px 8px 0", padding: "12px 14px" }}>
                      <div style={{ fontSize: 18 }}>👀</div>
                      <BlockStack gap="050">
                        <Text as="p" variant="bodyMd" fontWeight="semibold">Watch — {watch.length} campaign{watch.length > 1 ? "s" : ""} ROAS ≥ 1 but below {roasTarget}×</Text>
                        <Text as="p" variant="bodySm" tone="subdued">{watch.map(c => `${c.name} (${c.roas?.toFixed(2)}×)`).join(", ")} — profitable but not optimal. Test new creatives or adjust bids.</Text>
                      </BlockStack>
                    </div>
                  )}
                  {pause.length > 0 && (
                    <div style={{ display: "grid", gridTemplateColumns: "36px 1fr", gap: "0 12px", alignItems: "start", background: "#fff1f2", borderLeft: "3px solid #ef4444", borderRadius: "0 8px 8px 0", padding: "12px 14px" }}>
                      <div style={{ fontSize: 18 }}>⏸️</div>
                      <BlockStack gap="050">
                        <Text as="p" variant="bodyMd" fontWeight="semibold">Pause — {pause.length} campaign{pause.length > 1 ? "s" : ""} losing money (ROAS &lt; 1)</Text>
                        <Text as="p" variant="bodySm" tone="subdued">{pause.map(c => `${c.name} (${c.roas?.toFixed(2)}×)`).join(", ")} — spending {fmtDec(pause.reduce((s, c) => s + c.spend, 0))} with negative return. Pause or restructure.</Text>
                      </BlockStack>
                    </div>
                  )}
                  {noConv.length > 0 && (
                    <div style={{ display: "grid", gridTemplateColumns: "36px 1fr", gap: "0 12px", alignItems: "start", background: "#f0f9ff", borderLeft: "3px solid #38bdf8", borderRadius: "0 8px 8px 0", padding: "12px 14px" }}>
                      <div style={{ fontSize: 18 }}>ℹ️</div>
                      <BlockStack gap="050">
                        <Text as="p" variant="bodyMd" fontWeight="semibold">{noConv.length} campaign{noConv.length > 1 ? "s" : ""} spending with 0 Google-reported conversions</Text>
                        <Text as="p" variant="bodySm" tone="subdued">{noConv.map(c => c.name).join(", ")} — conversions may be tracked via Attribix attribution (gclid) but not reported back to Google. Check your conversion actions in Google Ads.</Text>
                      </BlockStack>
                    </div>
                  )}
                </BlockStack>
              </BlockStack>
            </Card>
          );
        })()}

        {/* Not connected / no data helper */}
        {isConnected && !hasData && (
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">How Google Ads sync works</Text>
              <BlockStack gap="200">
                <Text as="p" tone="subdued" variant="bodySm">
                  <Text as="span" fontWeight="semibold">Daily sync</Text> — Campaign spend, clicks, impressions, and Google-reported conversions are synced automatically every 24 hours.
                </Text>
                <Text as="p" tone="subdued" variant="bodySm">
                  <Text as="span" fontWeight="semibold">Offline conversions</Text> — When a purchase is attributed to a Google click (gclid), an offline conversion is uploaded to Google Ads to improve Smart Bidding signals.
                </Text>
                <Text as="p" tone="subdued" variant="bodySm">
                  <Text as="span" fontWeight="semibold">ROAS note</Text> — Google-reported ROAS uses their conversion tracking. Attribix ROAS uses server-side attribution and may differ slightly.
                </Text>
              </BlockStack>
            </BlockStack>
          </Card>
        )}

      </BlockStack>
    </Page>
  );
}
