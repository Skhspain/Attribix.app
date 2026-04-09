// app/components/RevenueSpendChart.tsx
// Shared Revenue vs Spend bar chart used on Analytics, Meta Ads, and Google Ads pages.

import { useState } from "react";

export type ChartDay = { label: string; revenue: number; spend: number };

export function RevenueSpendChart({
  data,
  currency = "NOK",
  showRoasLabels = true,
  revenueLabel = "Revenue",
}: {
  data: ChartDay[];
  currency?: string;
  showRoasLabels?: boolean;
  revenueLabel?: string;
}) {
  const maxRev = Math.max(1, ...data.map((d) => d.revenue));
  const maxSpend = Math.max(1, ...data.map((d) => d.spend));
  const CHART_H = 150;
  const SPEND_MAX_H = 48;

  const [tooltip, setTooltip] = useState<{ x: number; y: number } & ChartDay | null>(null);

  // Trend insight
  const half = Math.floor(data.length / 2);
  const firstHalfRev = data.slice(0, half).reduce((s, d) => s + d.revenue, 0);
  const secondHalfRev = data.slice(half).reduce((s, d) => s + d.revenue, 0);
  let insightText = "";
  if (firstHalfRev > 0 && secondHalfRev > 0) {
    const pct = Math.round(((secondHalfRev - firstHalfRev) / firstHalfRev) * 100);
    if (Math.abs(pct) >= 5) {
      insightText = pct > 0
        ? `↑ ${revenueLabel} up ${pct}% in the second half of this period`
        : `↓ ${revenueLabel} down ${Math.abs(pct)}% in the second half of this period`;
    } else {
      insightText = `→ ${revenueLabel} stable across this period`;
    }
  }

  const totalRev = data.reduce((s, d) => s + d.revenue, 0);
  const totalSpend = data.reduce((s, d) => s + d.spend, 0);
  const roas = totalSpend > 0 ? totalRev / totalSpend : null;

  function fmt(n: number) {
    try { return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(n); }
    catch { return `${currency} ${Math.round(n)}`; }
  }

  return (
    <div style={{ width: "100%", overflowX: "auto", position: "relative" }}>
      {/* KPI row */}
      <div style={{ display: "flex", gap: 24, marginBottom: 16, flexWrap: "wrap" }}>
        <div>
          <span style={{ fontSize: 11, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600 }}>{revenueLabel}</span>
          <div style={{ fontSize: 20, fontWeight: 700, color: "#4f46e5", lineHeight: 1.2 }}>{fmt(totalRev)}</div>
        </div>
        <div style={{ width: 1, background: "#e5e7eb", margin: "2px 0" }} />
        <div>
          <span style={{ fontSize: 11, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600 }}>Spend</span>
          <div style={{ fontSize: 20, fontWeight: 700, color: "#0ea5e9", lineHeight: 1.2 }}>{fmt(totalSpend)}</div>
        </div>
        <div style={{ width: 1, background: "#e5e7eb", margin: "2px 0" }} />
        <div>
          <span style={{ fontSize: 11, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600 }}>ROAS</span>
          <div style={{ fontSize: 20, fontWeight: 700, lineHeight: 1.2, color: roas === null ? "#9ca3af" : roas >= 2 ? "#16a34a" : roas >= 1 ? "#d97706" : "#dc2626" }}>
            {roas !== null ? Math.round(roas * 100) + "%" : "—"}
          </div>
        </div>
        {insightText && (
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center" }}>
            <span style={{ fontSize: 12, fontStyle: "italic", color: insightText.startsWith("↑") ? "#16a34a" : insightText.startsWith("↓") ? "#dc2626" : "#6b7280" }}>
              {insightText}
            </span>
          </div>
        )}
      </div>

      {/* Tooltip */}
      {tooltip && (
        <div style={{
          position: "fixed", left: tooltip.x + 14, top: tooltip.y - 16,
          background: "#111827", color: "#fff", borderRadius: 8, padding: "10px 14px",
          fontSize: 12, pointerEvents: "none", zIndex: 9999, whiteSpace: "nowrap",
          boxShadow: "0 4px 16px rgba(0,0,0,0.35)", minWidth: 160,
        }}>
          <div style={{ fontWeight: 700, marginBottom: 6, fontSize: 13 }}>{tooltip.label}</div>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "center" }}>
            <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#6366f1", display: "inline-block" }} />
              {revenueLabel}
            </span>
            <span style={{ fontWeight: 600 }}>{fmt(tooltip.revenue)}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "center", marginTop: 4 }}>
            <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#0ea5e9", display: "inline-block" }} />
              Spend
            </span>
            <span style={{ fontWeight: 600 }}>{fmt(tooltip.spend)}</span>
          </div>
          {tooltip.spend > 0 && (
            <div style={{ marginTop: 6, paddingTop: 6, borderTop: "1px solid rgba(255,255,255,0.12)", display: "flex", justifyContent: "space-between", gap: 16 }}>
              <span style={{ color: "#9ca3af" }}>ROAS</span>
              <span style={{ fontWeight: 700, color: (tooltip.revenue / tooltip.spend) >= 2 ? "#4ade80" : (tooltip.revenue / tooltip.spend) >= 1 ? "#fbbf24" : "#f87171" }}>
                {Math.round((tooltip.revenue / tooltip.spend) * 100)}%
              </span>
            </div>
          )}
        </div>
      )}

      {/* Bars */}
      <div style={{
        display: "grid",
        gridTemplateColumns: `repeat(${data.length}, minmax(0, 1fr))`,
        gap: 3, alignItems: "end", minHeight: 180, minWidth: data.length * 24,
      }}>
        {data.map((row) => {
          const isPositive = row.spend > 0 && row.revenue > row.spend;
          const isNegative = row.spend > 0 && row.revenue <= row.spend;
          const hasData = row.revenue > 0 || row.spend > 0;
          const revColor = isPositive
            ? "linear-gradient(180deg, #4ade80 0%, #16a34a 100%)"
            : isNegative
            ? "linear-gradient(180deg, #f87171 0%, #dc2626 100%)"
            : "linear-gradient(180deg, #818cf8 0%, #6366f1 100%)";

          const revH = row.revenue > 0 ? Math.max((row.revenue / maxRev) * CHART_H, 3) : 0;
          const spendH = row.spend > 0 ? Math.max((row.spend / maxSpend) * SPEND_MAX_H, 6) : 0;
          const dayRoas = row.spend > 0 ? row.revenue / row.spend : null;

          return (
            <div
              key={row.label}
              onMouseMove={(e) => setTooltip({ x: e.clientX, y: e.clientY, ...row })}
              onMouseLeave={() => setTooltip(null)}
              style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "end", cursor: "default" }}
            >
              <div style={{ width: "100%", height: CHART_H, display: "flex", alignItems: "end", justifyContent: "center", gap: 2, position: "relative" }}>
                <div style={{ width: "44%", height: revH, borderRadius: "3px 3px 0 0", background: revColor, transition: "height 0.2s ease" }} />
                <div style={{ width: "44%", height: spendH, borderRadius: "3px 3px 0 0", background: "linear-gradient(180deg, #38bdf8 0%, #0ea5e9 100%)", transition: "height 0.2s ease" }} />
              </div>
              {/* Date */}
              <div style={{ marginTop: 3, fontSize: 8, color: "#9ca3af", textAlign: "center", whiteSpace: "nowrap", overflow: "hidden", width: "100%", lineHeight: 1 }}>
                {row.label}
              </div>
              {/* ROAS per day */}
              <div style={{ height: 18, display: "flex", alignItems: "center", justifyContent: "center", width: "100%" }}>
                {showRoasLabels && dayRoas !== null && row.revenue > 0 && (
                  <span style={{ fontSize: 13, fontWeight: 800, lineHeight: 1, color: dayRoas >= 2 ? "#16a34a" : dayRoas >= 1 ? "#d97706" : "#dc2626" }}>
                    {Math.round(dayRoas * 100)}%
                  </span>
                )}
              </div>
              {/* Dot indicator */}
              {hasData && (
                <div style={{ width: 4, height: 4, borderRadius: "50%", marginTop: 1, background: isPositive ? "#16a34a" : isNegative ? "#dc2626" : "#9ca3af" }} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
