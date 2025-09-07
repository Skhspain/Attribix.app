// app/routes/api.report.overview.ts
import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import db from "~/utils/db.server";

export async function loader({}: LoaderFunctionArgs) {
  // Minimal stub; fill from Prisma later.
  return json({
    totals: { events: 0, purchases: 0, revenue: 0 },
    dateRange: { from: null, to: null },
  });
}
