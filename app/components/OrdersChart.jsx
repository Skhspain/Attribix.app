// app/components/OrdersChart.jsx
// Line chart for the Orders page.
// Left dropdown: metric (Revenue / Number of sales)
// Right dropdown: source (All, Meta, Google, Email, Direct, Other)
import { useState, useRef } from "react";

const SOURCES = [
  { key: "total",  label: "All sources", color: "#6366f1" },
  { key: "meta",   label: "Meta",        color: "#1877f2" },
  { key: "google", label: "Google",      color: "#16a34a" },
  { key: "email",  label: "Email",       color: "#d97706" },
  { key: "direct", label: "Direct",      color: "#9ca3af" },
  { key: "other",  label: "Other",       color: "#ec4899" },
];

const W = 800;
const H = 200;
const PAD = { top: 16, right: 16, bottom: 32, left: 56 };
const INNER_W = W - PAD.left - PAD.right;
const INNER_H = H - PAD.top - PAD.bottom;

function fmtMoney(n, currency = "USD") {
  try { return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(n); }
  catch { return `${Math.round(n)}`; }
}

function fmtShort(n, isCount, currency = "USD") {
  if (isCount) {
    if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
    return `${Math.round(n)}`;
  }
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
  return `${Math.round(n)}`;
}

function buildPath(points) {
  if (!points.length) return "";
  return points.reduce((acc, p, i) => {
    if (i === 0) return `M${p.x},${p.y}`;
    const prev = points[i - 1];
    const cpx = (prev.x + p.x) / 2;
    return `${acc} C${cpx},${prev.y} ${cpx},${p.y} ${p.x},${p.y}`;
  }, "");
}

const selectStyle = {
  padding: "5px 28px 5px 10px",
  border: "1px solid #e5e7eb",
  borderRadius: 8,
  fontSize: 13,
  fontWeight: 500,
  color: "#111827",
  background: "#fff url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%239ca3af'/%3E%3C/svg%3E\") no-repeat right 10px center",
  cursor: "pointer",
  appearance: "none",
  WebkitAppearance: "none",
  outline: "none",
};

export function OrdersChart({ data, currency = "USD" }) {
  const [metric, setMetric] = useState("revenue"); // "revenue" | "orders"
  const [source, setSource] = useState("total");
  const [tooltip, setTooltip] = useState(null);
  const svgRef = useRef(null);

  const n = data.length;
  if (!n) return null;

  const isCount = metric === "orders";
  const dataKey = isCount ? `${source}_count` : `${source}_rev`;
  const sourceInfo = SOURCES.find((s) => s.key === source) || SOURCES[0];

  const values = data.map((d) => d[dataKey] ?? 0);
  const maxVal = Math.max(1, ...values);

  function xPos(i) { return PAD.left + (i / Math.max(n - 1, 1)) * INNER_W; }
  function yPos(v) { return PAD.top + INNER_H - (v / maxVal) * INNER_H; }

  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => ({ v: maxVal * f, y: yPos(maxVal * f) }));
  const labelStep = n <= 14 ? 2 : n <= 31 ? 7 : 14;
  const xLabels = data.map((d, i) => ({ i, label: d.label, x: xPos(i) })).filter((_, i) => i % labelStep === 0 || i === n - 1);

  function handleMouseMove(e) {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const rawX = ((e.clientX - rect.left) / rect.width) * W;
    const ix = Math.round(((rawX - PAD.left) / INNER_W) * (n - 1));
    setTooltip({ i: Math.max(0, Math.min(n - 1, ix)), x: e.clientX, y: e.clientY });
  }

  const ttRow = tooltip != null ? data[tooltip.i] : null;
  const ttVal = ttRow ? (ttRow[dataKey] ?? 0) : 0;
  const color = sourceInfo.color;

  // Sources that have any data (for the dropdown)
  const activeSources = SOURCES.filter((s) =>
    s.key === "total" || data.some((d) => (d[`${s.key}_rev`] ?? 0) > 0)
  );

  // True when no attributed source (meta/google/email/other) has any data
  const onlyDirect = !data.some((d) =>
    (d.meta_rev ?? 0) > 0 || (d.google_rev ?? 0) > 0 ||
    (d.email_rev ?? 0) > 0 || (d.other_rev ?? 0) > 0
  );

  return (
    <div style={{ width: "100%" }}>
      {/* Controls */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        <select value={metric} onChange={(e) => setMetric(e.target.value)} style={selectStyle}>
          <option value="revenue">Total revenue</option>
          <option value="orders">Number of sales</option>
        </select>
        <select value={source} onChange={(e) => setSource(e.target.value)} style={selectStyle}>
          {activeSources.map((s) => (
            <option key={s.key} value={s.key}>{s.label}</option>
          ))}
        </select>
        {/* Colour indicator */}
        <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#6b7280" }}>
          <span style={{ width: 24, height: 3, borderRadius: 2, background: color, display: "inline-block" }} />
          {sourceInfo.label}
        </span>
        {onlyDirect && (
          <span style={{ fontSize: 12, color: "#9ca3af", fontStyle: "italic", marginLeft: 4 }}>
            No other sales sources detected
          </span>
        )}
      </div>

      {/* Tooltip */}
      {ttRow && (
        <div style={{
          position: "fixed", left: tooltip.x + 14, top: tooltip.y - 16, zIndex: 9999,
          background: "#111827", color: "#fff", borderRadius: 8, padding: "10px 14px",
          fontSize: 12, pointerEvents: "none", whiteSpace: "nowrap",
          boxShadow: "0 4px 16px rgba(0,0,0,.35)",
        }}>
          <div style={{ fontWeight: 700, marginBottom: 6, fontSize: 13 }}>{ttRow.label}</div>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 20, alignItems: "center" }}>
            <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: color }} />
              {isCount ? "Orders" : "Revenue"} · {sourceInfo.label}
            </span>
            <span style={{ fontWeight: 700 }}>
              {isCount ? ttVal : fmtMoney(ttVal, currency)}
            </span>
          </div>
        </div>
      )}

      {/* SVG */}
      <div style={{ width: "100%", overflowX: "auto" }}>
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          style={{ width: "100%", minWidth: 320, display: "block" }}
          onMouseMove={handleMouseMove}
          onMouseLeave={() => setTooltip(null)}
        >
          {/* Y grid + labels */}
          {yTicks.map(({ v, y }) => (
            <g key={v}>
              <line x1={PAD.left} x2={W - PAD.right} y1={y} y2={y} stroke="#f3f4f6" strokeWidth={1} />
              <text x={PAD.left - 6} y={y + 4} textAnchor="end" fontSize={9} fill="#9ca3af">
                {fmtShort(v, isCount, currency)}
              </text>
            </g>
          ))}

          {/* X axis */}
          <line x1={PAD.left} x2={W - PAD.right} y1={PAD.top + INNER_H} y2={PAD.top + INNER_H} stroke="#e5e7eb" strokeWidth={1} />

          {/* X labels */}
          {xLabels.map(({ i, label, x }) => (
            <text key={i} x={x} y={H - 6} textAnchor="middle" fontSize={9} fill="#9ca3af">{label}</text>
          ))}

          {/* Area fill */}
          {(() => {
            const pts = values.map((v, i) => ({ x: xPos(i), y: yPos(v) }));
            const linePath = buildPath(pts);
            const areaPath = linePath
              + ` L${xPos(n - 1)},${PAD.top + INNER_H} L${xPos(0)},${PAD.top + INNER_H} Z`;
            return (
              <path d={areaPath} fill={color} fillOpacity={0.08} />
            );
          })()}

          {/* Line */}
          {(() => {
            const pts = values.map((v, i) => ({ x: xPos(i), y: yPos(v) }));
            return (
              <path d={buildPath(pts)} fill="none" stroke={color} strokeWidth={2.5}
                strokeLinejoin="round" strokeLinecap="round" />
            );
          })()}

          {/* Dots */}
          {n <= 60 && values.map((v, i) => v > 0 && (
            <circle key={i} cx={xPos(i)} cy={yPos(v)}
              r={tooltip?.i === i ? 5 : 3}
              fill={color} stroke="#fff" strokeWidth={1.5}
            />
          ))}

          {/* Hover crosshair */}
          {tooltip != null && (
            <line
              x1={xPos(tooltip.i)} x2={xPos(tooltip.i)}
              y1={PAD.top} y2={PAD.top + INNER_H}
              stroke="#6b7280" strokeWidth={1} strokeDasharray="4 3"
            />
          )}

          {/* Transparent hover overlay */}
          <rect x={PAD.left} y={PAD.top} width={INNER_W} height={INNER_H}
            fill="transparent" style={{ cursor: "crosshair" }} />
        </svg>
      </div>
    </div>
  );
}

/** Build chart data — revenue AND count, per source, per day */
export function buildOrdersChartData(purchases, days = 30) {
  function normalizeSource(p) {
    const s = (p?.utmSource || "").toLowerCase();
    if (s.includes("meta") || s.includes("facebook") || s.includes("instagram")) return "meta";
    if (s.includes("google") || s.includes("adwords")) return "google";
    if (s.includes("bing") || s.includes("yahoo")) return "google"; // group search engines
    if (s.includes("snapchat") || s.includes("tiktok") || s.includes("pinterest") || s.includes("twitter") || s.includes(" x")) return "other";
    if (s.includes("email") || s.includes("klaviyo") || s.includes("mailchimp")) return "email";
    if (s) return "other";
    if (p?.fbclid) return "meta";
    if (p?.gclid) return "google";
    return "direct";
  }

  const now = new Date();
  const buckets = {};

  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    const label = d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
    buckets[key] = {
      date: key, label,
      total_rev: 0, meta_rev: 0, google_rev: 0, email_rev: 0, direct_rev: 0, other_rev: 0,
      total_count: 0, meta_count: 0, google_count: 0, email_count: 0, direct_count: 0, other_count: 0,
    };
  }

  for (const p of purchases) {
    const key = new Date(p.createdAt).toISOString().slice(0, 10);
    if (!buckets[key]) continue;
    const v = Number(p.totalValue || 0);
    const src = normalizeSource(p);
    buckets[key].total_rev += v;
    buckets[key][`${src}_rev`] = (buckets[key][`${src}_rev`] || 0) + v;
    buckets[key].total_count += 1;
    buckets[key][`${src}_count`] = (buckets[key][`${src}_count`] || 0) + 1;
  }

  return Object.values(buckets);
}
