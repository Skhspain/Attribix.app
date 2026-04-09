// app/routes/api.standalone.newsletter.campaign.$id.ts
import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { db } from "~/db.server";
import { authenticateStandalone, standaloneCors, standaloneOptions } from "~/utils/standalone-auth.server";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const preflight = standaloneOptions(request);
  if (preflight) return preflight;

  const auth = await authenticateStandalone(request);
  const campaign = await db.newsletterCampaign.findUnique({
    where: { id: params.id },
  });

  if (!campaign || !auth.shops.includes(campaign.shop)) {
    return standaloneCors(request, json({ ok: false, error: "Not found" }, { status: 404 }));
  }

  return standaloneCors(request, json({
    ok: true,
    campaign: {
      id: campaign.id,
      name: campaign.name,
      subject: campaign.subject,
      previewText: campaign.previewText,
      fromName: campaign.fromName,
      fromEmail: campaign.fromEmail,
      replyTo: campaign.replyTo,
      status: campaign.status,
      htmlContent: campaign.htmlContent,
      designJson: campaign.designJson,
      recipientCount: campaign.recipientCount,
      sentAt: campaign.sentAt,
    },
  }));
}
