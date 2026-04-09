// app/routes/api.standalone.newsletter.ts
import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { db } from "~/db.server";
import { authenticateStandalone, standaloneCors, standaloneOptions } from "~/utils/standalone-auth.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const preflight = standaloneOptions(request);
  if (preflight) return preflight;

  const auth = await authenticateStandalone(request);
  if (auth.shops.length === 0) return standaloneCors(request, json({ ok: true, subscribers: [], campaigns: [], settings: null }));

  const shopFilter = { shop: { in: auth.shops } };

  const [subscribers, campaigns, settings, subscriberStats] = await Promise.all([
    db.newsletterSubscriber.findMany({
      where: shopFilter,
      orderBy: { createdAt: "desc" },
      take: 200,
      select: {
        id: true, email: true, firstName: true, lastName: true,
        status: true, source: true, utmSource: true,
        createdAt: true, unsubscribedAt: true,
      },
    }),
    db.newsletterCampaign.findMany({
      where: shopFilter,
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true, name: true, subject: true, status: true,
        recipientCount: true, deliveredCount: true, openCount: true,
        clickCount: true, bounceCount: true, unsubCount: true,
        revenueAttributed: true, sentAt: true, scheduledAt: true, createdAt: true,
      },
    }),
    db.newsletterSettings.findFirst({ where: shopFilter }),
    db.newsletterSubscriber.groupBy({
      by: ["status"],
      where: shopFilter,
      _count: true,
    }),
  ]);

  const stats = {
    subscribed: 0,
    unsubscribed: 0,
    total: 0,
  };
  for (const s of subscriberStats) {
    const count = typeof s._count === "number" ? s._count : 0;
    if (s.status === "subscribed") stats.subscribed = count;
    else if (s.status === "unsubscribed") stats.unsubscribed = count;
    stats.total += count;
  }

  return standaloneCors(request, json({ ok: true, subscribers, campaigns, settings, stats }));
}
