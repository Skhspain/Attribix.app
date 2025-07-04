import { json } from "@remix-run/node";
import { db } from "~/utils/db.server"; // Adjust if your db import differs
import { getSession } from "~/sessions"; // Your session helper to identify the shop

export const loader = async ({ request }) => {
  const session = await getSession(request.headers.get("Cookie"));
  const shop = session.get("shop");

  if (!shop) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  const settings = await db.trackingSettings.findUnique({
    where: { shop },
  });

  return json({
    pixelId: settings?.pixelId || "",
    enabled: settings?.enabled || false,
  });
};

export const action = async ({ request }) => {
  const session = await getSession(request.headers.get("Cookie"));
  const shop = session.get("shop");

  if (!shop) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  const data = await request.json();
  const { pixelId, enabled } = data;

  await db.trackingSettings.upsert({
    where: { shop },
    update: { pixelId, enabled },
    create: { shop, pixelId, enabled },
  });

  return json({ success: true });
};