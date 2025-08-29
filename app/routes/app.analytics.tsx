// File: app/routes/app.analytics.tsx
import * as React from "react";
import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import db from "~/utils/db.server";

// ----- Types -----
type Metrics = {
  visits: number;
  conversions: number;
  revenue: number;
  adspend: number;
  roas: number | null;
  cpp: number | null;
};

type RecentPurchase = {
  id: string;
  createdAt: string; // ISO string for the client
  totalValue: number;
  currency: string;
};

type LoaderData = {
  range: { from: string; to: string };
  metrics: Metrics;
  recentPurchases: RecentPurchase[];
};

// Internal type for the Prisma select below (pre-serialization)
type PurchaseRow = {
  id: string;
  createdAt: Date;
  totalValue: number;
  currency: string;
};

// ----- Loader (server) -----
export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");

  const start = from ? new Date(from) : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const end = to ? new Date(to) : new Date();

  const [visits, conversions, revenueAgg, spendAgg, recent] = await Promise.all([
    db.trackedEvent.count({
      where: { eventName: "page_view", createdAt: { gte: start, lte: end } },
    }),
    db.purchase.count({
      where: { createdAt: { gte: start, lte: end } },
    }),
    db.purchase.aggregate({
      _sum: { totalValue: true },
      where: { createdAt: { gte: start, lte: end } },
    }),
    db.adSpendDaily.aggregate({
      _sum: { spend: true },
      where: { date: { gte: start, lte: end } },
    }),
    db.purchase.findMany({
      where: { createdAt: { gte: start, lte: end } },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: { id: true, createdAt: true, totalValue: true, currency: true },
    }),
  ]);

  const revenue = revenueAgg._sum.totalValue || 0;
  const adspend = spendAgg._sum.spend || 0;
  const roas = adspend > 0 ? revenue / adspend : null;
  const cpp = conversions > 0 ? adspend / conversions : null;

  const data: LoaderData = {
    range: { from: start.toISOString(), to: end.toISOString() },
    metrics: { visits, conversions, revenue, adspend, roas, cpp },
    recentPurchases: (recent as PurchaseRow[]).map((r): RecentPurchase => ({
      id: r.id,
      createdAt: r.createdAt.toISOString(),
      totalValue: r.totalValue,
      currency: r.currency,
    })),
  };

  return json<LoaderData>(data);
}

// ----- UI (client) -----
function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ border: "1px solid #e5e7eb", borderRadius: 16, padding: 16, background: "#fff" }}>
      <div style={{ fontSize: 12, color: "#64748b", marginBottom: 4 }}>{title}</div>
      <div style={{ fontSize: 28, fontWeight: 600 }}>{children}</div>
    </div>
  );
}

export default function AppAnalytics() {
  const { metrics, range, recentPurchases } = useLoaderData<LoaderData>();

  const money = (n: number) =>
    Number(n || 0).toLocaleString(undefined, {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    });

  const when = (iso: string) => new Date(iso).toLocaleString();

  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: "0 auto" }}>
      <div style={{ marginBottom: 16, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>Analytics</h1>
        <div style={{ color: "#64748b", fontSize: 12 }}>
          Range: {range.from.slice(0, 10)} → {range.to.slice(0, 10)}
        </div>
      </div>

      {/* KPI grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 16,
          marginBottom: 24,
        }}
      >
        <Card title="Total Visits">{metrics.visits.toLocaleString()}</Card>
        <Card title="Conversions">{metrics.conversions.toLocaleString()}</Card>
        <Card title="Revenue">{money(metrics.revenue)}</Card>
        <Card title="Ad Spend">{money(metrics.adspend)}</Card>
        <Card title="ROAS">{metrics.roas == null ? "–" : metrics.roas.toFixed(2)}</Card>
        <Card title="Cost / Purchase">{metrics.cpp == null ? "–" : money(metrics.cpp)}</Card>
      </div>

      {/* Recent purchases */}
      <div
        style={{
          border: "1px solid #e5e7eb",
          borderRadius: 16,
          background: "#fff",
          padding: 16,
          marginBottom: 32,
        }}
      >
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Recent Purchases</div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ textAlign: "left", color: "#64748b", fontSize: 12 }}>
                <th style={{ padding: "8px 6px", borderBottom: "1px solid #e5e7eb" }}>When</th>
                <th style={{ padding: "8px 6px", borderBottom: "1px solid #e5e7eb" }}>ID</th>
                <th style={{ padding: "8px 6px", borderBottom: "1px solid #e5e7eb" }}>Value</th>
              </tr>
            </thead>
            <tbody>
              {recentPurchases.length === 0 ? (
                <tr>
                  <td colSpan={3} style={{ padding: "14px 6px", color: "#64748b" }}>
                    No purchases in range.
                  </td>
                </tr>
              ) : (
                recentPurchases.map((p) => (
                  <tr key={p.id}>
                    <td style={{ padding: "10px 6px", borderBottom: "1px solid #f1f5f9" }}>{when(p.createdAt)}</td>
                    <td style={{ padding: "10px 6px", borderBottom: "1px solid #f1f5f9" }}>{p.id}</td>
                    <td style={{ padding: "10px 6px", borderBottom: "1px solid #f1f5f9" }}>
                      {money(p.totalValue)} {p.currency}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Footer link */}
      <div style={{ textAlign: "center", marginTop: 32, fontSize: 14 }}>
        For more analytics,{" "}
        <a
          href="https://attribix.com/login"
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: "#2563eb", fontWeight: 500 }}
        >
          log in to the website →
        </a>
      </div>
    </div>
  );
}
