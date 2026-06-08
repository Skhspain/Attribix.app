// app/routes/api.newsletter.export.ts
// GET /api/newsletter/export?status=subscribed
// Streams a CSV of newsletter subscribers for the authenticated shop.

import type { LoaderFunctionArgs } from "@remix-run/node";
import { authenticate } from "~/shopify.server";
import db from "~/db.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const url = new URL(request.url);
  const status = url.searchParams.get("status") || "";

  const where: any = { shop };
  if (status) where.status = status;

  const subscribers = await db.newsletterSubscriber.findMany({
    where,
    orderBy: { createdAt: "desc" },
    select: {
      email: true,
      firstName: true,
      lastName: true,
      status: true,
      source: true,
      utmSource: true,
      utmMedium: true,
      utmCampaign: true,
      createdAt: true,
    },
  });

  const header = "email,first_name,last_name,status,source,utm_source,utm_medium,utm_campaign,created_at\n";
  const rows = subscribers.map(s =>
    [
      s.email,
      s.firstName ?? "",
      s.lastName ?? "",
      s.status,
      s.source ?? "",
      s.utmSource ?? "",
      s.utmMedium ?? "",
      s.utmCampaign ?? "",
      new Date(s.createdAt).toISOString(),
    ]
      .map(v => `"${String(v).replace(/"/g, '""')}"`)
      .join(",")
  );

  const csv = header + rows.join("\n");
  const filename = `subscribers-${status || "all"}-${new Date().toISOString().slice(0, 10)}.csv`;

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
