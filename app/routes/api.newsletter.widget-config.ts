// app/routes/api.newsletter.widget-config.ts
// Public CORS endpoint — returns newsletter widget config for a shop.
// Called by /scripts/newsletter-widget.js at page load.

import { json, type LoaderFunctionArgs } from "@remix-run/node";
import db from "~/db.server";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Cache-Control": "no-store",
};

export async function loader({ request }: LoaderFunctionArgs) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }

  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");
  if (!shop) return json({ enabled: false }, { headers: CORS });

  const anyDb = db as any;
  const config = await anyDb.newsletterWidgetConfig?.findUnique?.({ where: { shop } }).catch(() => null);

  if (!config) return json({ enabled: false }, { headers: CORS });

  let pageTargeting: string[] = ["all"];
  try { pageTargeting = JSON.parse(config.pageTargeting ?? '["all"]'); } catch {}

  return json({
    enabled: config.enabled ?? true,
    templateId: config.templateId,
    templateType: config.templateType,
    buttonColor: config.buttonColor ?? "#008060",
    textColor: config.textColor ?? "#ffffff",
    borderRadius: config.borderRadius ?? 6,
    fontFamily: config.fontFamily ?? "-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",
    btnLabel: config.btnLabel ?? "Subscribe",
    triggerType: config.triggerType ?? "timer",
    triggerDelay: config.triggerDelay ?? 5,
    scrollDepth: config.scrollDepth ?? 50,
    pageTargeting,
    dismissLimit: config.dismissLimit ?? 3,
    dismissPeriod: config.dismissPeriod ?? "month",
    apiBase: process.env.SHOPIFY_APP_URL || "https://attribix-app.fly.dev",
  }, { headers: CORS });
}
