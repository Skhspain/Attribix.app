// app/routes/app.analytics.tsx
import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import db from "../utils/db.server";

export async function loader({}: LoaderFunctionArgs) {
  const anyDb = db as any; // relax types until your Prisma schema includes these models

  const [events, orders, revenue, spend, latest] = await Promise.all([
    anyDb.trackedEvent?.count?.().catch(() => 0),
    anyDb.purchase?.count?.().catch(() => 0),
    anyDb.purchase?.aggregate?.({ _sum: { total: true } }).catch(() => ({ _sum: { total: 0 } })),
    anyDb.adSpendDaily?.aggregate?.({ _sum: { spend: true } }).catch(() => ({ _sum: { spend: 0 } })),
    anyDb.purchase?.findMany?.({ orderBy: { createdAt: "desc" }, take: 10 }).catch(() => []),
  ]);

  return json({
    events: events ?? 0,
    orders: orders ?? 0,
    revenue: revenue?._sum?.total ?? 0,
    spend: spend?._sum?.spend ?? 0,
    latest: latest ?? [],
  });
}

export default function AppAnalytics() {
  const data = useLoaderData<typeof loader>();
  return <pre style={{ padding: 16 }}>{JSON.stringify(data, null, 2)}</pre>;
}
