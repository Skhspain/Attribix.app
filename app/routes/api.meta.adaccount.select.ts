// app/routes/api.meta.adaccount.select.ts
import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { authenticate } from "~/shopify.server";
import db from "~/db.server";

export async function action({ request }: ActionFunctionArgs) {
  const result = await authenticate.admin(request);
  if (result instanceof Response) return result;

  const shop = result.session.shop;

  const form = await request.formData();
  const adAccountId = String(form.get("adAccountId") || "").trim();

  if (!adAccountId) {
    return json({ ok: false, error: "Missing adAccountId" }, { status: 400 });
  }

  // Ensure Meta is connected first
  const conn = await db.metaConnection.findUnique({ where: { shop } });
  if (!conn || !conn.accessToken || conn.accessToken === "__PENDING__") {
    return json({ ok: false, error: "Meta not connected" }, { status: 400 });
  }

  await db.metaConnection.update({
    where: { shop },
    data: { adAccountId },
  });

  return json({ ok: true, adAccountId });
}
