// app/routes/analytics.tsx
import * as React from "react";
import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import prisma from "~/utils/db.server"; // keeps the import your code expected

export async function loader({}: LoaderFunctionArgs) {
  // If you don't have tables yet, just return empty stats.
  return json({
    totals: { events: 0, purchases: 0, revenue: 0 },
    recentPurchases: [],
  });
}

export default function AnalyticsRoute() {
  const data = useLoaderData<typeof loader>();
  return (
    <main style={{ padding: 24 }}>
      <h1>Analytics</h1>
      <pre style={{ opacity: 0.7 }}>{JSON.stringify(data, null, 2)}</pre>
    </main>
  );
}
