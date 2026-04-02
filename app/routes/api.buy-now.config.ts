// app/routes/api.buy-now.config.ts
import { json, type LoaderFunctionArgs } from "@remix-run/node";
import db from "~/db.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");

  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": "public, max-age=30",
  };

  if (!shop) return json({ enabled: false }, { headers: corsHeaders });

  const anyDb = db as any;
  const settings = await anyDb.buyNowSettings?.findUnique?.({ where: { shop } }).catch(() => null);

  return json({
    enabled: settings?.enabled ?? false,
    buttonText: settings?.buttonText ?? "Buy Now",
    buttonColor: settings?.buttonColor ?? "#008060",
    textColor: settings?.textColor ?? "#ffffff",
    borderRadius: settings?.borderRadius ?? 4,
    size: settings?.size ?? "medium",
    action: settings?.action ?? "checkout",
  }, { headers: corsHeaders });
}
