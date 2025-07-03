import { authenticate } from "../shopify.server";
import prisma from "../db.server";

function toCSV(events) {
  const headers = [
    "id",
    "eventName",
    "url",
    "utmSource",
    "utmMedium",
    "utmCampaign",
    "shop",
    "orderId",
    "value",
    "currency",
    "email",
    "phone",
    "ip",
    "userAgent",
    "sessionId",
    "createdAt",
    "products",
  ];
  const lines = events.map((e) => {
    const prod = e.products.map((p) => `${p.productName}:${p.quantity}`).join("|");
    return headers
      .map((h) => {
        const val = e[h] instanceof Date ? e[h].toISOString() : e[h];
        return `"${(val ?? "").toString().replace(/"/g, '""')}"`;
      })
      .slice(0, -1)
      .concat(`"${prod.replace(/"/g, '""')}"`)
      .join(",");
  });
  return [headers.join(","), ...lines].join("\n");
}

export const loader = async ({ request }) => {
  await authenticate.admin(request);
  const url = new URL(request.url);
  const start = url.searchParams.get("start");
  const end = url.searchParams.get("end");
  const format = url.searchParams.get("format") || "json";

  const where = {};
  if (start) {
    where.createdAt = { gte: new Date(start) };
  }
  if (end) {
    where.createdAt = Object.assign(where.createdAt || {}, { lte: new Date(end) });
  }

  const events = await prisma.trackedEvent.findMany({
    where,
    include: { products: true },
  });

  if (format === "csv") {
    const csv = toCSV(events);
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": "attachment; filename=tracked-data.csv",
      },
    });
  }

  return new Response(JSON.stringify(events, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": "attachment; filename=tracked-data.json",
    },
  });
};