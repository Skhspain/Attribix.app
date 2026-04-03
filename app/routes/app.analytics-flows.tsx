// app/routes/app.analytics.flows.tsx
// Top navigation flows — Sankey diagram showing the first 4 steps visitors take.

import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { authenticate } from "~/shopify.server";
import db from "~/db.server";
import { Page, Card, BlockStack, InlineStack, Text, Select } from "@shopify/polaris";
import { useState, useMemo } from "react";

// ─── Types ───────────────────────────────────────────────────────────────────

type FlowPage   = { path: string; views: number; isOther?: boolean };
type FlowTrans  = { from: string; to: string; count: number };
type FlowData   = {
  steps: FlowPage[][];
  transitions: FlowTrans[][];
  dropoffs: number[];
  totalSessions: number;
};

// ─── Loader ──────────────────────────────────────────────────────────────────

function getPath(url: string): string {
  try {
    const u = new URL(url.startsWith("http") ? url : `https://x.com${url}`);
    const p = u.pathname.replace(/\/$/, "") || "/";
    return p.length > 35 ? p.slice(0, 35) + "…" : p;
  } catch { return "/"; }
}

const TOP_N = 5;

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const url = new URL(request.url);
  const days = Number(url.searchParams.get("days") ?? 30);
  const since = new Date(Date.now() - days * 86400000);

  const anyDb = db as any;
  const events: { sessionId: string | null; url: string | null; createdAt: Date }[] =
    await anyDb.trackedEvent?.findMany?.({
      where: { shop, eventName: "page_viewed", createdAt: { gte: since }, sessionId: { not: null }, url: { not: null } },
      select: { sessionId: true, url: true, createdAt: true },
      orderBy: [{ sessionId: "asc" }, { createdAt: "asc" }],
      take: 100000,
    }).catch(() => []) ?? [];

  // Build sessions
  const sessionMap: Record<string, string[]> = {};
  for (const e of events) {
    if (!e.sessionId || !e.url) continue;
    const path = getPath(e.url);
    if (!sessionMap[e.sessionId]) sessionMap[e.sessionId] = [];
    const arr = sessionMap[e.sessionId];
    if (arr[arr.length - 1] !== path) arr.push(path);
  }
  const sessions = Object.values(sessionMap);
  const totalSessions = sessions.length;

  // Count pages at each step and transitions
  const stepCounts: Record<string, number>[] = [{}, {}, {}, {}];
  const transCounts: Record<string, Record<string, number>>[] = [{}, {}, {}];

  for (const path of sessions) {
    for (let s = 0; s < 4; s++) {
      if (path[s]) stepCounts[s][path[s]] = (stepCounts[s][path[s]] || 0) + 1;
      if (s < 3 && path[s] && path[s + 1]) {
        if (!transCounts[s][path[s]]) transCounts[s][path[s]] = {};
        transCounts[s][path[s]][path[s + 1]] = (transCounts[s][path[s]][path[s + 1]] || 0) + 1;
      }
    }
  }

  // Top N pages per step
  const steps: FlowPage[][] = stepCounts.map((counts) => {
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    const top = sorted.slice(0, TOP_N).map(([path, views]) => ({ path, views }));
    const otherViews = sorted.slice(TOP_N).reduce((s, [, v]) => s + v, 0);
    const otherCount = sorted.length - TOP_N;
    if (otherViews > 0) top.push({ path: `${otherCount} more pages`, views: otherViews, isOther: true });
    return top;
  });

  // Resolve transitions, grouping non-top pages into "other"
  const topSets = steps.map(sp => new Set(sp.filter(p => !p.isOther).map(p => p.path)));
  const transitions: FlowTrans[][] = transCounts.map((stepTrans, si) => {
    const agg: Record<string, Record<string, number>> = {};
    const otherFrom = steps[si].find(p => p.isOther)?.path ?? "__other__";
    const otherTo   = steps[si + 1]?.find(p => p.isOther)?.path ?? "__other__";
    for (const [from, tos] of Object.entries(stepTrans)) {
      const fk = topSets[si].has(from) ? from : otherFrom;
      for (const [to, count] of Object.entries(tos)) {
        const tk = topSets[si + 1]?.has(to) ? to : otherTo;
        if (!agg[fk]) agg[fk] = {};
        agg[fk][tk] = (agg[fk][tk] || 0) + count;
      }
    }
    return Object.entries(agg).flatMap(([from, tos]) =>
      Object.entries(tos).map(([to, count]) => ({ from, to, count }))
    );
  });

  const dropoffs = [0, 1, 2].map((s) => {
    const a = sessions.filter(p => p.length > s).length;
    const b = sessions.filter(p => p.length > s + 1).length;
    return a - b;
  });

  return json({ steps, transitions, dropoffs, totalSessions, days });
}

// ─── Sankey SVG Component ─────────────────────────────────────────────────────

const STEP_LABELS = ["1st page", "2nd page", "3rd page", "4th page"];
const BAR_COLORS  = ["#1d4ed8", "#2563eb", "#3b82f6", "#60a5fa", "#93c5fd", "#cbd5e1"];
const OTHER_COLOR = "#94a3b8";

// Fixed canvas geometry
const W        = 880;   // SVG width
const H        = 440;   // SVG height
const PAD_TOP  = 32;
const PAD_BOT  = 36;
const BAR_H    = H - PAD_TOP - PAD_BOT;   // 372px usable bar height
const BAR_GAP  = 6;     // gap between stacked bars within a column
const BAR_W    = 10;    // bar rect width
const COL_W    = 200;   // width of text label area per column
const COL_FULL = COL_W + 20; // column + ribbon gap = 220
// bar left-x for each of the 4 columns
const COL_X    = [0, COL_FULL, COL_FULL * 2, COL_FULL * 3];

type BarEntry = { path: string; views: number; isOther: boolean; y: number; h: number; color: string };
type ColLayout = BarEntry[];

function buildLayout(steps: FlowPage[][]): ColLayout[] {
  return steps.map((pages, si) => {
    const total  = pages.reduce((s, p) => s + p.views, 0) || 1;
    const gaps   = (pages.length - 1) * BAR_GAP;
    const avail  = BAR_H - gaps;
    let y = PAD_TOP;
    return pages.map((page, pi) => {
      const h = Math.max(6, Math.round((page.views / total) * avail));
      const entry: BarEntry = {
        path: page.path,
        views: page.views,
        isOther: page.isOther ?? false,
        y,
        h,
        color: page.isOther ? OTHER_COLOR : BAR_COLORS[Math.min(pi, BAR_COLORS.length - 1)],
      };
      y += h + BAR_GAP;
      return entry;
    });
  });
}

function buildRibbons(
  layout: ColLayout[],
  transitions: FlowTrans[][],
  steps: FlowPage[][]
) {
  const ribbons: { d: string; opacity: number; stepIdx: number }[] = [];

  transitions.forEach((stepTrans, si) => {
    const srcCol  = layout[si];
    const dstCol  = layout[si + 1];
    const srcTotal = steps[si].reduce((s, p) => s + p.views, 0) || 1;
    const dstTotal = steps[si + 1].reduce((s, p) => s + p.views, 0) || 1;

    // Track Y offset consumed within each bar (for stacking ribbons inside a bar)
    const srcOffset: Record<string, number> = {};
    const dstOffset: Record<string, number> = {};

    // Sort by count desc so biggest ribbons draw first
    const sorted = [...stepTrans].sort((a, b) => b.count - a.count);

    for (const t of sorted) {
      const src = srcCol.find(b => b.path === t.from);
      const dst = dstCol.find(b => b.path === t.to);
      if (!src || !dst) continue;

      const rh_src = Math.max(2, Math.round((t.count / srcTotal) * src.h));
      const rh_dst = Math.max(2, Math.round((t.count / dstTotal) * dst.h));

      const srcOff = srcOffset[t.from] ?? 0;
      const dstOff = dstOffset[t.to]  ?? 0;

      const x1 = COL_X[si] + BAR_W;        // right edge of source bar
      const x2 = COL_X[si + 1];             // left edge of dest bar
      const cx  = (x1 + x2) / 2;

      const y1t = src.y + srcOff;
      const y1b = y1t + rh_src;
      const y2t = dst.y + dstOff;
      const y2b = y2t + rh_dst;

      // Ribbon path: top bezier → straight down → bottom bezier back
      const d = [
        `M ${x1} ${y1t}`,
        `C ${cx} ${y1t}, ${cx} ${y2t}, ${x2} ${y2t}`,
        `L ${x2} ${y2b}`,
        `C ${cx} ${y2b}, ${cx} ${y1b}, ${x1} ${y1b}`,
        "Z",
      ].join(" ");

      const opacity = Math.max(0.12, Math.min(0.4, t.count / srcTotal * 1.5));
      ribbons.push({ d, opacity, stepIdx: si });

      srcOffset[t.from] = srcOff + rh_src;
      dstOffset[t.to]   = dstOff + rh_dst;
    }
  });

  return ribbons;
}

function SankeyChart({ data }: { data: FlowData }) {
  const layout  = useMemo(() => buildLayout(data.steps), [data]);
  const ribbons = useMemo(() => buildRibbons(layout, data.transitions, data.steps), [layout, data]);

  const totalAtStep = data.steps.map(sp => sp.reduce((s, p) => s + p.views, 0));

  return (
    <div style={{ overflowX: "auto" }}>
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} style={{ display: "block", maxWidth: "100%" }}>
        {/* Column header labels */}
        {STEP_LABELS.map((label, si) => (
          <text key={si} x={COL_X[si]} y={18} fontSize={11} fontWeight={600}
            fill="#9ca3af" style={{ textTransform: "uppercase", letterSpacing: 0.5 }}>
            {label}
          </text>
        ))}

        {/* Ribbons (drawn first so bars sit on top) */}
        {ribbons.map((r, i) => (
          <path key={i} d={r.d} fill="#3b82f6" fillOpacity={r.opacity} />
        ))}

        {/* Bars and labels */}
        {layout.map((col, si) => (
          <g key={si}>
            {col.map((bar) => (
              <g key={bar.path}>
                {/* Colored bar rect */}
                <rect
                  x={COL_X[si]} y={bar.y}
                  width={BAR_W} height={bar.h}
                  fill={bar.color} rx={2}
                />

                {/* Page path text */}
                <text
                  x={COL_X[si] + BAR_W + 6}
                  y={bar.y + Math.min(bar.h / 2, 14)}
                  fontSize={11} fontWeight={bar.isOther ? 400 : 600}
                  fill={bar.isOther ? "#9ca3af" : "#111827"}
                  dominantBaseline="middle"
                >
                  {bar.path}
                </text>

                {/* View count */}
                {bar.h > 20 && (
                  <text
                    x={COL_X[si] + BAR_W + 6}
                    y={bar.y + Math.min(bar.h / 2, 14) + 14}
                    fontSize={10} fill="#9ca3af"
                    dominantBaseline="middle"
                  >
                    👁 {bar.views.toLocaleString()}
                  </text>
                )}

                {/* Percentage badge (left of bar for col 0, between cols otherwise) */}
                {si === 0 && (
                  <text
                    x={COL_X[si] - 4} y={bar.y + bar.h / 2}
                    fontSize={10} fontWeight={700} fill="#6b7280"
                    textAnchor="end" dominantBaseline="middle"
                  >
                    {Math.round((bar.views / (totalAtStep[si] || 1)) * 100)}%
                  </text>
                )}
              </g>
            ))}

            {/* Drop-off label at bottom of each gap */}
            {si < 3 && (
              <text
                x={COL_X[si] + COL_FULL / 2} y={H - 6}
                fontSize={10} fill="#9ca3af" textAnchor="middle"
              >
                {data.dropoffs[si]?.toLocaleString()} dropped off
              </text>
            )}
          </g>
        ))}
      </svg>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function NavigationFlowsPage() {
  const loaderData = useLoaderData<typeof loader>();
  const [days, setDays] = useState(String(loaderData.days));
  const data: FlowData = loaderData;

  function changePeriod(val: string) {
    setDays(val);
    window.location.href = `/app/analytics-flows?days=${val}`;
  }

  const reached = [
    loaderData.totalSessions,
    loaderData.totalSessions - (loaderData.dropoffs[0] ?? 0),
    loaderData.totalSessions - (loaderData.dropoffs[0] ?? 0) - (loaderData.dropoffs[1] ?? 0),
    loaderData.totalSessions - (loaderData.dropoffs[0] ?? 0) - (loaderData.dropoffs[1] ?? 0) - (loaderData.dropoffs[2] ?? 0),
  ];

  return (
    <Page
      title="Top navigation flows"
      subtitle="Explore the first 4 steps that visitors take on your site"
      backAction={{ content: "Analytics", url: "/app/analytics" }}
    >
      <BlockStack gap="500">

        {/* Header + period picker */}
        <InlineStack align="space-between" blockAlign="center">
          <Text as="p" variant="bodySm" tone="subdued">
            Based on {loaderData.totalSessions.toLocaleString()} tracked sessions
          </Text>
          <div style={{ width: 160 }}>
            <Select
              label="" labelHidden
              options={[
                { label: "Last 7 days",  value: "7"  },
                { label: "Last 30 days", value: "30" },
                { label: "Last 90 days", value: "90" },
              ]}
              value={days}
              onChange={changePeriod}
            />
          </div>
        </InlineStack>

        {/* Main chart */}
        <Card>
          {loaderData.totalSessions === 0 ? (
            <div style={{ padding: 48, textAlign: "center" }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>📊</div>
              <Text as="p" variant="bodyMd" tone="subdued">
                No page view data yet. Make sure the Attribix tracking script is installed on your store.
              </Text>
            </div>
          ) : (
            <BlockStack gap="500">
              <SankeyChart data={data} />

              {/* Step funnel summary */}
              <div style={{
                display: "grid",
                gridTemplateColumns: "repeat(4, 1fr)",
                gap: 1,
                background: "#e5e7eb",
                borderRadius: 8,
                overflow: "hidden",
              }}>
                {STEP_LABELS.map((label, i) => (
                  <div key={i} style={{ background: "#fff", padding: "12px 16px", textAlign: "center" }}>
                    <div style={{ fontSize: 11, color: "#9ca3af", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 4 }}>
                      {label}
                    </div>
                    <div style={{ fontSize: 20, fontWeight: 800, color: "#111827" }}>
                      {reached[i].toLocaleString()}
                    </div>
                    {i > 0 && (
                      <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 2 }}>
                        {Math.round((reached[i] / (reached[0] || 1)) * 100)}% of sessions
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </BlockStack>
          )}
        </Card>

      </BlockStack>
    </Page>
  );
}
