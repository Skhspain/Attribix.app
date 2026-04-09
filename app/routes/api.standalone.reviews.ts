// app/routes/api.standalone.reviews.ts
import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { db } from "~/db.server";
import { authenticateStandalone, standaloneCors, standaloneOptions } from "~/utils/standalone-auth.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const preflight = standaloneOptions(request);
  if (preflight) return preflight;

  const auth = await authenticateStandalone(request);
  if (auth.shops.length === 0) return standaloneCors(request, json({ ok: true, reviews: [], stats: {} }));

  const shopFilter = { shop: { in: auth.shops } };
  const url = new URL(request.url);
  const status = url.searchParams.get("status") || undefined;
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "100", 10), 500);

  const where: any = { ...shopFilter };
  if (status) where.status = status;

  const [reviews, statusCounts, avgRating] = await Promise.all([
    db.review.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        id: true, productId: true, productTitle: true,
        reviewerName: true, reviewerEmail: true,
        rating: true, title: true, body: true,
        status: true, verifiedPurchase: true,
        reply: true, repliedAt: true, createdAt: true,
      },
    }),
    db.review.groupBy({
      by: ["status"],
      where: shopFilter,
      _count: true,
    }),
    db.review.aggregate({
      where: { ...shopFilter, status: "approved" },
      _avg: { rating: true },
      _count: true,
    }),
  ]);

  const stats: Record<string, number> = {};
  for (const s of statusCounts) {
    stats[s.status] = typeof s._count === "number" ? s._count : 0;
  }

  return standaloneCors(request, json({
    ok: true,
    reviews,
    stats,
    avgRating: Math.round((avgRating._avg?.rating || 0) * 10) / 10,
    totalApproved: avgRating._count || 0,
  }));
}
