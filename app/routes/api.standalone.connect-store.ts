// app/routes/api.standalone.connect-store.ts
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { db } from "~/db.server";
import {
  authenticateStandalone,
  standaloneCors,
  standaloneOptions,
} from "~/utils/standalone-auth.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const preflight = standaloneOptions(request);
  if (preflight) return preflight;
  return standaloneCors(request, new Response("Method not allowed", { status: 405 }));
}

export async function action({ request }: ActionFunctionArgs) {
  const preflight = standaloneOptions(request);
  if (preflight) return preflight;

  if (request.method !== "POST") {
    return standaloneCors(request, new Response("Method not allowed", { status: 405 }));
  }

  const auth = await authenticateStandalone(request);
  const body = await request.json().catch(() => null);

  if (!body?.shop || typeof body.shop !== "string") {
    return standaloneCors(
      request,
      json({ ok: false, error: "Missing 'shop' in request body" }, { status: 400 })
    );
  }

  const shop = body.shop.trim().toLowerCase();

  // Check if already linked
  const existing = await db.orgStore.findFirst({
    where: { orgId: auth.orgId, shop },
  });

  if (existing) {
    return standaloneCors(
      request,
      json({ ok: true, message: "Store already connected", shop, orgId: auth.orgId })
    );
  }

  // Create the link
  await db.orgStore.create({
    data: { orgId: auth.orgId, shop },
  });

  return standaloneCors(
    request,
    json({ ok: true, message: "Store connected", shop, orgId: auth.orgId })
  );
}
