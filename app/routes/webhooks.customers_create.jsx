import { authenticate } from "../shopify.server";
import db from "~/utils/db.server";

export const action = async ({ request }) => {
  const { topic, shop, payload } = await authenticate.webhook(request);
  console.log(`Received ${topic} webhook for ${shop}`);

  try {
    const { id: customer_id, email, phone, created_at } = payload || {};
    await db.trackedEvent.create({
      data: {
        eventName: "CustomerCreate",
        shop,
        email: email || undefined,
        phone: phone || undefined,
        orderId: customer_id ? String(customer_id) : null,
        createdAt: created_at ? new Date(created_at) : undefined,
      },
    });
  } catch (err) {
    console.error("Failed to persist customers/create webhook", err);
  }

  return new Response("OK", { status: 200 });
};
