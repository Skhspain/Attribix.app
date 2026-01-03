// app/routes/api.debug-test.tsx
import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import prisma from "~/db.server";
import { authenticate } from "~/shopify.server";

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return json(
      { ok: false, error: "Method not allowed" },
      { status: 405 }
    );
  }

  // Make sure this is called from the Shopify admin (embedded app)
  const { session } = await authenticate.admin(request);
  const shopDomain = session.shop;

  try {
    await prisma.trackedEvent.create({
      data: {
        // IMPORTANT: use the existing Prisma field: `shop`, not `shopDomain`
        shop: shopDomain,
        eventName: "debug_test_event",
        url: "https://attribix-debug",
        utmSource: "debug",
        utmMedium: "admin",
        utmCampaign: "debug-page",
        value: 1,
        currency: "USD",
      },
    });

    return json({ ok: true });
  } catch (error) {
    console.error("Debug test event create error:", error);
    return json(
      { ok: false, error: "Failed to create debug event" },
      { status: 500 }
    );
  }
}
