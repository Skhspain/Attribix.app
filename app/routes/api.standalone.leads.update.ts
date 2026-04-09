// app/routes/api.standalone.leads.update.ts
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

  const action = body?.action;

  // CREATE a new lead
  if (action === "create") {
    if (!body.email) return standaloneCors(request, json({ ok: false, error: "Email required" }, { status: 400 }));
    const shop = auth.shops[0];
    if (!shop) return standaloneCors(request, json({ ok: false, error: "No shop connected" }, { status: 400 }));

    const lead = await db.lead.create({
      data: {
        shop,
        email: body.email,
        firstName: body.firstName || null,
        lastName: body.lastName || null,
        phone: body.phone || null,
        company: body.company || null,
        source: body.source || "manual",
        status: body.status || "new",
        notes: body.notes || null,
        tags: body.tags || null,
      },
    });
    return standaloneCors(request, json({ ok: true, lead }));
  }

  // UPDATE existing lead
  if (action === "update") {
    if (!body.id) return standaloneCors(request, json({ ok: false, error: "Missing lead id" }, { status: 400 }));

    const lead = await db.lead.findUnique({ where: { id: body.id } });
    if (!lead || !auth.shops.includes(lead.shop)) {
      return standaloneCors(request, json({ ok: false, error: "Lead not found" }, { status: 404 }));
    }

    const updates: any = {};
    if (body.status) updates.status = body.status;
    if (typeof body.notes === "string") updates.notes = body.notes;
    if (body.firstName !== undefined) updates.firstName = body.firstName;
    if (body.lastName !== undefined) updates.lastName = body.lastName;
    if (body.phone !== undefined) updates.phone = body.phone;
    if (body.company !== undefined) updates.company = body.company;
    if (body.tags !== undefined) updates.tags = body.tags;
    if (body.status === "converted") updates.convertedAt = new Date();

    const updated = await db.lead.update({ where: { id: body.id }, data: updates });
    return standaloneCors(request, json({ ok: true, lead: updated }));
  }

  // DELETE lead
  if (action === "delete") {
    if (!body.id) return standaloneCors(request, json({ ok: false, error: "Missing lead id" }, { status: 400 }));
    const lead = await db.lead.findUnique({ where: { id: body.id } });
    if (!lead || !auth.shops.includes(lead.shop)) {
      return standaloneCors(request, json({ ok: false, error: "Lead not found" }, { status: 404 }));
    }
    await db.lead.delete({ where: { id: body.id } });
    return standaloneCors(request, json({ ok: true, deleted: true }));
  }

  return standaloneCors(request, json({ ok: false, error: "Invalid action" }, { status: 400 }));
}
