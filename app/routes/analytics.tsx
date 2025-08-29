// app/routes/analytics.tsx
import * as React from "react";
import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import prisma from "~/utils/db.server";


type LoaderData = {
  range: { from: string; to: string };
  metrics: {
    visits: number;
    conversions: number;
    revenue: number;
    adspend: number;
    roas: number | null;
    cpp: number | null;
  };
  recentPurchases: {
    id: string;
    createdAt: string;
    totalValue: number;
    currency: string;
  }[];
};

function startEndFromRequest(request: Request) {
  const url = new URL(request.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const start = from ? new Date(from) : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const end = to ? new Date(to) : new Date();
  return { start, end };
}

export async function loader({ request }: LoaderFunctionArgs) {
  const { start, end } = startEndFromRequest(request);

  const [visits, conversions, revenueAgg, spendAgg, recent] = await Promise.all([
    prisma.trackedEvent.count({
      where: { eventName: "page_view", createdAt: { gte: start, lte: end } },
    }),
    prisma.purchase.count({ where: { createdAt: { gte: start, lte: end } } }),
    prisma.purchase.aggregate({
      _sum: { totalValue: true },
      where: { createdAt: { gte: start, lte: end } },
    }),
    prisma.adSpendDaily.aggregate({
      _sum: { spend: true },
      where: { date: { gte: start, lte: end } },
    }),
    prisma.purchase.findMany({
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
    recentPurchases: recent.map((r) => ({
      id: r.id,
      createdAt: r.createdAt.toISOString(),
      totalValue: r.totalValue,
      currency: r.currency,
    })),
  };

  return json(data);
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        border: "1px solid #e5e7eb",
        borderRadius: 16,
        padding: 16,
        background: "#fff",
      }}
    >
      <div style={{ fontSize: 12, color: "#64748b", marginBottom: 4 }}>{title}</div>
      <div style={{ fontSize: 28, fontWeight: 600 }}>{children}</div>
    </div>
  );
}

export default function AnalyticsPage() {
  const { metrics, range, recentPurchases } = useLoaderData<LoaderData>();

  const fmtMoney = (n: number) =>
    n.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });
  const fmtDate = (iso: string) => new Date(iso).toLocaleString();

  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: "0 auto" }}>
      <div
        style={{
          marginBottom: 16,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
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
        <Card title="Revenue">{fmtMoney(metrics.revenue)}</Card>
        <Card title="Ad Spend">{fmtMoney(metrics.adspend)}</Card>
        <Card title="ROAS">{metrics.roas == null ? "–" : metrics.roas.toFixed(2)}</Card>
        <Card title="Cost / Purchase">{metrics.cpp == null ? "–" : fmtMoney(metrics.cpp)}</Card>
      </div>

      {/* Recent Purchases */}
      <div
        style={{
          border: "1px solid #e5e7eb",
          borderRadius: 16,
          background: "#fff",
          padding: 16,
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
                    <td style={{ padding: "10px 6px", borderBottom: "1px solid #f1f5f9" }}>
                      {fmtDate(p.createdAt)}
                    </td>
                    <td style={{ padding: "10px 6px", borderBottom: "1px solid #f1f5f9" }}>{p.id}</td>
                    <td style={{ padding: "10px 6px", borderBottom: "1px solid #f1f5f9" }}>
                      {fmtMoney(p.totalValue)} {p.currency}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
