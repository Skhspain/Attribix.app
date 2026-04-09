// app/routes/api.standalone.leads.ts
import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { db } from "~/db.server";
import { authenticateStandalone, standaloneCors, standaloneOptions } from "~/utils/standalone-auth.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const preflight = standaloneOptions(request);
  if (preflight) return preflight;

  const auth = await authenticateStandalone(request);
  if (auth.shops.length === 0) return standaloneCors(request, json({ ok: true, leads: [], stats: {} }));

  const shopFilter = { shop: { in: auth.shops } };
  const url = new URL(request.url);
  const status = url.searchParams.get("status") || undefined;
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "100", 10), 500);

  const where: any = { ...shopFilter };
  if (status) where.status = status;

  const [leads, statusCounts] = await Promise.all([
    db.lead.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        id: true, email: true, firstName: true, lastName: true,
        phone: true, company: true, source: true, status: true,
        notes: true, tags: true,
        utmSource: true, utmMedium: true, utmCampaign: true,
        fbclid: true, gclid: true, referrer: true,
        convertedAt: true, createdAt: true,
      },
    }),
    db.lead.groupBy({
      by: ["status"],
      where: shopFilter,
      _count: true,
    }),
  ]);

  const stats: Record<string, number> = {};
  for (const s of statusCounts) {
    stats[s.status] = typeof s._count === "number" ? s._count : 0;
  }

  return standaloneCors(request, json({ ok: true, leads, stats }));
}
