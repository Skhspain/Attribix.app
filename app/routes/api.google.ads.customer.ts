import { json, type ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "~/shopify.server";
import db from "~/db.server";

export async function action({ request }: ActionFunctionArgs) {
  const result = await authenticate.admin(request);
  if (result instanceof Response) return result;

  const form = await request.formData();
  const shop = String(form.get("shop") || result.session.shop);
  const customerId = String(form.get("customerId") || "").trim();

  if (!customerId) {
    return json({ ok: false, error: "Missing customerId" }, { status: 400 });
  }

  try {
    const conn = await db.googleConnection.findUnique({ where: { shop } });
    if (!conn) {
      return json({ ok: false, error: "GoogleConnection not found for shop" }, { status: 404 });
    }

    await db.googleConnection.update({
      where: { shop },
      data: { adCustomerId: customerId },
    });

    return json({ ok: true, customerId });
  } catch (err: any) {  
    return json({ ok: false, error: err?.message || String(err) }, { status: 500 });
  }
}
