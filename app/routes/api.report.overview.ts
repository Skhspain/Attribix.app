// app/routes/api.report.overview.ts
import type { LoaderFunctionArgs } from "@remix-run/node";
import db from "~/utils/db.server"; // ← default import (fix)

const ORIGIN = process.env.REPORTS_ALLOW_ORIGIN || "*";
const API_KEY = process.env.REPORTS_API_KEY || "";

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": ORIGIN,
    "Access-Control-Allow-Headers": "content-type,x-attribix-key",
    "Access-Control-Allow-Methods": "GET,OPTIONS",
    "Content-Type": "application/json",
  };
}

function withCors(status = 200, body?: any) {
  return new Response(body ? JSON.stringify(body) : null, {
    status,
    headers: corsHeaders(),
  });
}

function assertApiKey(request: Request) {
  if (!API_KEY) return; // disabled if unset
  const key = request.headers.get("x-attribix-key");
  if (key !== API_KEY) {
    throw new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: corsHeaders(),
    });
  }
}

function parseRange(request: Request) {
  const url = new URL(request.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const start = from ? new Date(from) : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const end = to ? new Date(to) : new Date();
  return { start, end };
}

export async function loader({ request }: LoaderFunctionArgs) {
  if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders() });
  if (request.method !== "GET") return withCors(405, { error: "Method not allowed" });

  try {
    assertApiKey(request);
  } catch (e: any) {
    return e; // 401 with CORS
  }

  const { start, end } = parseRange(request);

  // Match YOUR schema: TrackedEvent.eventName, Purchase.createdAt, AdSpendDaily.date
  const [visits, conversions, revenueAgg, spendAgg] = await Promise.all([
    db.trackedEvent.count({
      where: { eventName: "page_view", createdAt: { gte: start, lte: end } },
    }),
    db.purchase.count({ where: { createdAt: { gte: start, lte: end } } }),
    db.purchase.aggregate({
      _sum: { totalValue: true },
      where: { createdAt: { gte: start, lte: end } },
    }),
    db.adSpendDaily.aggregate({
      _sum: { spend: true },
      where: { date: { gte: start, lte: end } },
    }),
  ]);

  const revenue = revenueAgg._sum.totalValue || 0;
  const adspend = spendAgg._sum.spend || 0;
  const roas = adspend > 0 ? revenue / adspend : null;
  const cpp = (conversions || 0) > 0 ? adspend / conversions : null;

  return withCors(200, {
    range: { from: start.toISOString(), to: end.toISOString() },
    metrics: { visits, conversions, revenue, adspend, roas, cpp },
  });
}

export function action() {
  return withCors(405, { error: "Method not allowed" });
}
