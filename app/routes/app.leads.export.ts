// app/routes/app.leads.export.ts
// Returns all leads as a CSV file download.
// Called via: GET /app/leads/export?status=all&source=all

import type { LoaderFunctionArgs } from "@remix-run/node";
import { authenticate } from "~/shopify.server";
import db from "~/db.server";

const HEADERS = [
  "email",
  "firstName",
  "lastName",
  "phone",
  "company",
  "source",
  "status",
  "notes",
  "tags",
  "utmSource",
  "utmMedium",
  "utmCampaign",
  "fbclid",
  "gclid",
  "referrer",
  "convertedAt",
  "createdAt",
];

function escapeCsv(val: unknown): string {
  if (val === null || val === undefined) return "";
  const str = String(val);
  // Quote if contains comma, newline or double-quote
  if (str.includes(",") || str.includes("\n") || str.includes('"')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function toIsoDate(val: unknown): string {
  if (!val) return "";
  try {
    return new Date(val as string).toISOString().slice(0, 10);
  } catch {
    return String(val);
  }
}

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const anyDb = db as any;

  const url = new URL(request.url);
  const statusFilter = url.searchParams.get("status") ?? "all";
  const sourceFilter = url.searchParams.get("source") ?? "all";

  const where: Record<string, unknown> = { shop };
  if (statusFilter !== "all") where.status = statusFilter;
  if (sourceFilter !== "all") where.source = sourceFilter;

  const leads = await anyDb.lead
    ?.findMany?.({
      where,
      orderBy: { createdAt: "desc" },
      // No take limit — export everything
    })
    .catch(() => []) ?? [];

  // Build CSV
  const rows: string[] = [HEADERS.join(",")];

  for (const lead of leads) {
    const row = [
      escapeCsv(lead.email),
      escapeCsv(lead.firstName),
      escapeCsv(lead.lastName),
      escapeCsv(lead.phone),
      escapeCsv(lead.company),
      escapeCsv(lead.source),
      escapeCsv(lead.status),
      escapeCsv(lead.notes),
      escapeCsv(lead.tags),
      escapeCsv(lead.utmSource),
      escapeCsv(lead.utmMedium),
      escapeCsv(lead.utmCampaign),
      escapeCsv(lead.fbclid),
      escapeCsv(lead.gclid),
      escapeCsv(lead.referrer),
      escapeCsv(toIsoDate(lead.convertedAt)),
      escapeCsv(toIsoDate(lead.createdAt)),
    ];
    rows.push(row.join(","));
  }

  const csv = rows.join("\r\n");
  const filename = `leads_${shop.replace(/\.myshopify\.com$/, "")}_${new Date().toISOString().slice(0, 10)}.csv`;

  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
