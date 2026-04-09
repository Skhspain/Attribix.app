// app/routes/api.standalone.events.ts
import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { db } from "~/db.server";
import {
  authenticateStandalone,
  standaloneCors,
  standaloneOptions,
} from "~/utils/standalone-auth.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const preflight = standaloneOptions(request);
  if (preflight) return preflight;

  const auth = await authenticateStandalone(request);
  const url = new URL(request.url);

  const days = parseInt(url.searchParams.get("days") || "30", 10);
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "50", 10), 200);
  const offset = parseInt(url.searchParams.get("offset") || "0", 10);
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const shopFilter = auth.shops.length > 0 ? { shop: { in: auth.shops } } : undefined;
  const where = shopFilter
    ? { OR: [shopFilter, { accountId: auth.accountId }], createdAt: { gte: since } }
    : { accountId: auth.accountId, createdAt: { gte: since } };

  const [events, total] = await Promise.all([
    db.trackedEvent.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
      select: {
        id: true,
        eventName: true,
        createdAt: true,
        url: true,
        utmSource: true,
        utmMedium: true,
        utmCampaign: true,
        ip: true,
        referrer: true,
        revenue: true,
        currency: true,
        orderId: true,
      },
    }),
    db.trackedEvent.count({ where }),
  ]);

  return standaloneCors(
    request,
    json({ ok: true, events, total, limit, offset })
  );
}
