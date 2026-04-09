// app/routes/reviews.api.$shop.$productId.tsx
// Public JSON endpoint — returns approved reviews + widget settings for a product.
import { json, type LoaderFunctionArgs } from "@remix-run/node";
import db from "../db.server";

export async function loader({ params }: LoaderFunctionArgs) {
  const shop = decodeURIComponent(params.shop!);
  const productId = decodeURIComponent(params.productId!);
  const anyDb = db as any;

  const [reviews, widgetSettings, reviewSettings] = await Promise.all([
    anyDb.review.findMany({
      where: { shop, productId, status: "approved" },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true, rating: true, title: true, body: true,
        reviewerName: true, verifiedPurchase: true, reply: true,
        createdAt: true, images: true,
      },
    }).catch(() => []),
    anyDb.reviewWidgetSettings?.findUnique?.({ where: { shop } }).catch(() => null),
    anyDb.reviewSettings?.findUnique?.({ where: { shop } }).catch(() => null),
  ]);

  const avg = reviews.length
    ? reviews.reduce((s: number, r: any) => s + r.rating, 0) / reviews.length
    : null;

  const settings = {
    primaryColor: widgetSettings?.primaryColor ?? "#4f46e5",
    starColor: widgetSettings?.starColor ?? "#f59e0b",
    backgroundColor: widgetSettings?.backgroundColor ?? "#ffffff",
    borderColor: widgetSettings?.borderColor ?? "#e5e7eb",
    layout: widgetSettings?.layout ?? "list",
    showVerifiedBadge: widgetSettings?.showVerifiedBadge ?? true,
    showReviewerName: widgetSettings?.showReviewerName ?? true,
    showDate: widgetSettings?.showDate ?? true,
    allowImages: widgetSettings?.allowImages ?? true,
    translateTo: widgetSettings?.translateTo ?? null,
    allowPublicReviews: reviewSettings?.allowPublicReviews ?? true,
    autoDetectTheme: widgetSettings?.autoDetectTheme ?? true,
  };

  // Parse images JSON for each review
  const parsedReviews = reviews.map((r: any) => ({
    ...r,
    images: r.images ? (() => { try { return JSON.parse(r.images); } catch { return []; } })() : [],
  }));

  return json(
    { reviews: parsedReviews, count: reviews.length, avg, settings },
    { headers: { "Access-Control-Allow-Origin": "*", "Cache-Control": "public, max-age=60" } }
  );
}
