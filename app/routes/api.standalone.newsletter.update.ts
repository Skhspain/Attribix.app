// app/routes/api.standalone.newsletter.update.ts
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { db } from "~/db.server";
import { authenticateStandalone, standaloneCors, standaloneOptions } from "~/utils/standalone-auth.server";
import { getShopPlan, checkSubscribersQuota } from "~/services/plan.server";

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
  const action = body?.action;
  const shop = auth.shops[0];
  if (!shop) return standaloneCors(request, json({ ok: false, error: "No shop connected" }, { status: 400 }));

  // CREATE campaign
  if (action === "create-campaign") {
    const designJson = body.designJson ? (typeof body.designJson === "string" ? JSON.parse(body.designJson) : body.designJson) : null;
    const campaign = await db.newsletterCampaign.create({
      data: {
        shop,
        name: body.name || "Untitled Campaign",
        subject: body.subject || "",
        previewText: body.previewText || null,
        htmlContent: body.htmlContent || null,
        designJson: designJson,
        status: "draft",
      },
    });
    return standaloneCors(request, json({ ok: true, campaign }));
  }

  // UPDATE campaign
  if (action === "update-campaign") {
    if (!body.id) return standaloneCors(request, json({ ok: false, error: "Missing campaign id" }, { status: 400 }));
    const campaign = await db.newsletterCampaign.findUnique({ where: { id: body.id } });
    if (!campaign || campaign.shop !== shop) return standaloneCors(request, json({ ok: false, error: "Not found" }, { status: 404 }));

    const updates: any = {};
    if (body.name) updates.name = body.name;
    if (body.subject) updates.subject = body.subject;
    if (body.previewText !== undefined) updates.previewText = body.previewText;
    if (body.htmlContent !== undefined) updates.htmlContent = body.htmlContent;
    if (body.status) updates.status = body.status;
    if (body.scheduledAt) updates.scheduledAt = new Date(body.scheduledAt);

    const updated = await db.newsletterCampaign.update({ where: { id: body.id }, data: updates });
    return standaloneCors(request, json({ ok: true, campaign: updated }));
  }

  // ADD subscriber
  if (action === "add-subscriber") {
    if (!body.email) return standaloneCors(request, json({ ok: false, error: "Email required" }, { status: 400 }));

    // Quota check — only for new subscribers (not re-subscribing)
    const existing = await db.newsletterSubscriber.findUnique({ where: { shop_email: { shop, email: body.email } } });
    if (!existing || existing.status === "unsubscribed") {
      const plan = await getShopPlan(shop);
      const quota = await checkSubscribersQuota(shop, plan);
      if (!quota.allowed) {
        return standaloneCors(request, json({ ok: false, error: `Subscriber limit reached (${quota.used}/${quota.limit}). Upgrade your plan to add more subscribers.` }, { status: 403 }));
      }
    }

    const subscriber = await db.newsletterSubscriber.upsert({
      where: { shop_email: { shop, email: body.email } },
      create: {
        shop, email: body.email,
        firstName: body.firstName || null,
        lastName: body.lastName || null,
        source: body.source || "manual",
        status: "subscribed",
      },
      update: { status: "subscribed", firstName: body.firstName || undefined, lastName: body.lastName || undefined },
    });
    return standaloneCors(request, json({ ok: true, subscriber }));
  }

  // UNSUBSCRIBE
  if (action === "unsubscribe") {
    if (!body.email) return standaloneCors(request, json({ ok: false, error: "Email required" }, { status: 400 }));
    await db.newsletterSubscriber.updateMany({
      where: { shop, email: body.email },
      data: { status: "unsubscribed", unsubscribedAt: new Date() },
    });
    return standaloneCors(request, json({ ok: true }));
  }

  // UPDATE settings
  if (action === "update-settings") {
    const settings = await db.newsletterSettings.upsert({
      where: { shop },
      create: {
        shop,
        fromName: body.fromName || "",
        fromEmail: body.fromEmail || "",
        replyTo: body.replyTo || "",
        footerText: body.footerText || "",
      },
      update: {
        ...(body.fromName !== undefined && { fromName: body.fromName }),
        ...(body.fromEmail !== undefined && { fromEmail: body.fromEmail }),
        ...(body.replyTo !== undefined && { replyTo: body.replyTo }),
        ...(body.footerText !== undefined && { footerText: body.footerText }),
      },
    });
    return standaloneCors(request, json({ ok: true, settings }));
  }

  // DELETE campaign
  if (action === "delete-campaign") {
    if (!body.id) return standaloneCors(request, json({ ok: false, error: "Missing id" }, { status: 400 }));
    const campaign = await db.newsletterCampaign.findUnique({ where: { id: body.id } });
    if (!campaign || campaign.shop !== shop) return standaloneCors(request, json({ ok: false, error: "Not found" }, { status: 404 }));
    await db.newsletterCampaign.delete({ where: { id: body.id } });
    return standaloneCors(request, json({ ok: true, deleted: true }));
  }

  return standaloneCors(request, json({ ok: false, error: "Invalid action" }, { status: 400 }));
}
