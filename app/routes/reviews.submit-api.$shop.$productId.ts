// app/routes/reviews.submit-api.$shop.$productId.ts
// Public JSON API for inline review submission from the widget
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import db from "../db.server";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function loader({ request }: LoaderFunctionArgs) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  return new Response("Method not allowed", { status: 405, headers: CORS });
}

export async function action({ request, params }: ActionFunctionArgs) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

  const shop = decodeURIComponent(params.shop!);
  const productId = decodeURIComponent(params.productId!);
  const anyDb = db as any;

  const body = await request.json().catch(() => null);
  if (!body?.reviewerName || !body?.body || !body?.rating) {
    return json({ ok: false, error: "Name, review, and rating are required" }, { status: 400, headers: CORS });
  }

  // Check if auto-approve is enabled
  const settings = await anyDb.reviewSettings?.findUnique?.({ where: { shop } }).catch(() => null);
  const status = settings?.autoApprove ? "approved" : "pending";

  // Store images as JSON array of base64 data URLs (max 5)
  const images = Array.isArray(body.images) ? body.images.slice(0, 5) : [];
  const imagesJson = images.length > 0 ? JSON.stringify(images) : null;

  await anyDb.review.create({
    data: {
      shop,
      productId: String(body.productId || productId),
      productTitle: body.productTitle || "",
      reviewerName: body.reviewerName,
      reviewerEmail: body.reviewerEmail || "",
      rating: Math.min(5, Math.max(1, Number(body.rating))),
      title: body.title || null,
      body: body.body,
      images: imagesJson,
      status,
      verifiedPurchase: false,
    },
  });

  return json(
    { ok: true, message: status === "approved" ? "Review published!" : "Review submitted for moderation." },
    { headers: CORS }
  );
}
