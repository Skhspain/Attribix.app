// app/routes/api.standalone.reviews.update.ts
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { db } from "~/db.server";
import { authenticateStandalone, standaloneCors, standaloneOptions } from "~/utils/standalone-auth.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const preflight = standaloneOptions(request);
  if (preflight) return preflight;
  return standaloneCors(request, new Response("Method not allowed", { status: 405 }));
}

export async function action({ request }: ActionFunctionArgs) {
  const preflight = standaloneOptions(request);
  if (preflight) return preflight;

  if (request.method !== "POST") return standaloneCors(request, new Response("Method not allowed", { status: 405 }));

  const auth = await authenticateStandalone(request);
  const body = await request.json().catch(() => null);

  if (!body?.id) return standaloneCors(request, json({ ok: false, error: "Missing review id" }, { status: 400 }));

  // Verify review belongs to user's shop
  const review = await db.review.findUnique({ where: { id: body.id } });
  if (!review || !auth.shops.includes(review.shop)) {
    return standaloneCors(request, json({ ok: false, error: "Review not found" }, { status: 404 }));
  }

  const updates: any = {};
  if (body.status && ["pending", "approved", "rejected"].includes(body.status)) updates.status = body.status;
  if (typeof body.reply === "string") { updates.reply = body.reply; updates.repliedAt = new Date(); }

  const updated = await db.review.update({ where: { id: body.id }, data: updates });

  return standaloneCors(request, json({ ok: true, review: updated }));
}
