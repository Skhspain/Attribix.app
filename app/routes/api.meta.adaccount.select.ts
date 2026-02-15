// app/routes/api.meta.adaccount.select.ts
import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { authenticate } from "~/shopify.server";
import db from "~/db.server";

export async function action({ request }: ActionFunctionArgs) {
  const result = await authenticate.admin(request);
  if (result instanceof Response) return result;

  const { session } = result;
  const shop = session.shop;

  const form = await request.formData();
  const adAccountId = String(form.get("adAccountId") || "").trim();

  if (!adAccountId) {
    return json({ ok: false, error: "Missing adAccountId" }, { status: 400 });
  }

  await db.metaConnection.upsert({
    where: { shop },
    update: { adAccountId },
    create: {
      shop,
      adAccountId,
      accessToken: "__PENDING__", // required by Prisma if record doesn't exist yet
    },
  });

  return json({ ok: true, adAccountId });
}
