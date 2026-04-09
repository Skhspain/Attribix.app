// app/routes/api.standalone.newsletter.save-template.ts
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { db } from "~/db.server";
import { authenticateStandalone, standaloneCors, standaloneOptions } from "~/utils/standalone-auth.server";

// Custom saved templates stored in DB
export async function loader({ request }: LoaderFunctionArgs) {
  const preflight = standaloneOptions(request);
  if (preflight) return preflight;

  const auth = await authenticateStandalone(request);
  if (auth.shops.length === 0) return standaloneCors(request, json({ ok: true, templates: [] }));

  // Query campaigns marked as templates
  const templates = await db.newsletterCampaign.findMany({
    where: { shop: { in: auth.shops }, status: "template" },
    select: { id: true, name: true, htmlContent: true, designJson: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });

  return standaloneCors(request, json({ ok: true, templates }));
}

export async function action({ request }: ActionFunctionArgs) {
  const preflight = standaloneOptions(request);
  if (preflight) return preflight;

  const auth = await authenticateStandalone(request);
  const shop = auth.shops[0];
  if (!shop) return standaloneCors(request, json({ ok: false, error: "No shop" }, { status: 400 }));

  const body = await request.json().catch(() => null);

  if (body?.action === "save") {
    const template = await db.newsletterCampaign.create({
      data: {
        shop,
        name: body.name || "My Template",
        subject: "",
        status: "template",
        htmlContent: body.htmlContent || null,
        designJson: body.designJson || null,
      },
    });
    return standaloneCors(request, json({ ok: true, template }));
  }

  if (body?.action === "delete") {
    if (!body.id) return standaloneCors(request, json({ ok: false, error: "Missing id" }, { status: 400 }));
    await db.newsletterCampaign.delete({ where: { id: body.id } });
    return standaloneCors(request, json({ ok: true }));
  }

  return standaloneCors(request, json({ ok: false, error: "Invalid action" }, { status: 400 }));
}
