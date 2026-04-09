// app/routes/api.standalone.reviews.settings.ts
import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { db } from "~/db.server";
import { authenticateStandalone, standaloneCors, standaloneOptions } from "~/utils/standalone-auth.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const preflight = standaloneOptions(request);
  if (preflight) return preflight;

  const auth = await authenticateStandalone(request);
  if (auth.shops.length === 0) return standaloneCors(request, json({ ok: true, settings: null, widgetSettings: null }));

  const shop = auth.shops[0];
  const [settings, widgetSettings] = await Promise.all([
    db.reviewSettings.findUnique({ where: { shop } }).catch(() => null),
    db.reviewWidgetSettings.findUnique({ where: { shop } }).catch(() => null),
  ]);

  return standaloneCors(request, json({ ok: true, settings, widgetSettings }));
}

export async function action({ request }: ActionFunctionArgs) {
  const preflight = standaloneOptions(request);
  if (preflight) return preflight;

  const auth = await authenticateStandalone(request);
  const shop = auth.shops[0];
  if (!shop) return standaloneCors(request, json({ ok: false, error: "No shop" }, { status: 400 }));

  const body = await request.json().catch(() => null);
  const target = body?.target; // "settings" or "widget"

  if (target === "settings") {
    const settings = await db.reviewSettings.upsert({
      where: { shop },
      create: {
        shop,
        autoApprove: body.autoApprove ?? false,
        sendRequestEmail: body.sendRequestEmail ?? true,
        requestDelayDays: body.requestDelayDays ?? 7,
        emailSubject: body.emailSubject ?? "How was your order from {shop}?",
        emailBody: body.emailBody ?? "Hi {name},\n\nThank you for your recent order!\n\n{review_link}",
        discountEnabled: body.discountEnabled ?? false,
        discountType: body.discountType ?? "percentage",
        discountValue: body.discountValue ?? 10,
        discountExpiryDays: body.discountExpiryDays ?? 30,
      },
      update: {
        ...(body.autoApprove !== undefined && { autoApprove: body.autoApprove }),
        ...(body.sendRequestEmail !== undefined && { sendRequestEmail: body.sendRequestEmail }),
        ...(body.requestDelayDays !== undefined && { requestDelayDays: body.requestDelayDays }),
        ...(body.emailSubject !== undefined && { emailSubject: body.emailSubject }),
        ...(body.emailBody !== undefined && { emailBody: body.emailBody }),
        ...(body.discountEnabled !== undefined && { discountEnabled: body.discountEnabled }),
        ...(body.discountType !== undefined && { discountType: body.discountType }),
        ...(body.discountValue !== undefined && { discountValue: body.discountValue }),
        ...(body.discountExpiryDays !== undefined && { discountExpiryDays: body.discountExpiryDays }),
      },
    });
    return standaloneCors(request, json({ ok: true, settings }));
  }

  if (target === "widget") {
    const widget = await db.reviewWidgetSettings.upsert({
      where: { shop },
      create: {
        shop,
        primaryColor: body.primaryColor ?? "#4f46e5",
        starColor: body.starColor ?? "#f59e0b",
        backgroundColor: body.backgroundColor ?? "#ffffff",
        borderColor: body.borderColor ?? "#e5e7eb",
        layout: body.layout ?? "list",
        showVerifiedBadge: body.showVerifiedBadge ?? true,
        showReviewerName: body.showReviewerName ?? true,
        showDate: body.showDate ?? true,
        allowImages: body.allowImages ?? true,
      },
      update: {
        ...(body.primaryColor !== undefined && { primaryColor: body.primaryColor }),
        ...(body.starColor !== undefined && { starColor: body.starColor }),
        ...(body.backgroundColor !== undefined && { backgroundColor: body.backgroundColor }),
        ...(body.borderColor !== undefined && { borderColor: body.borderColor }),
        ...(body.layout !== undefined && { layout: body.layout }),
        ...(body.showVerifiedBadge !== undefined && { showVerifiedBadge: body.showVerifiedBadge }),
        ...(body.showReviewerName !== undefined && { showReviewerName: body.showReviewerName }),
        ...(body.showDate !== undefined && { showDate: body.showDate }),
        ...(body.allowImages !== undefined && { allowImages: body.allowImages }),
      },
    });
    return standaloneCors(request, json({ ok: true, widgetSettings: widget }));
  }

  return standaloneCors(request, json({ ok: false, error: "Invalid target" }, { status: 400 }));
}
