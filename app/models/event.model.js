import { json } from "@remix-run/node";
import Event, { connectMongo } from "~/models/event.model";

export const action = async ({ request }) => {
  try {
    await connectMongo();
    const body = await request.json();
    const shop = request.headers.get("x-shopify-shop") || "unknown";
    const { event, data, timestamp } = body;

    if (!event || typeof event !== "string") {
      return json({ error: "Missing event name" }, { status: 400 });
    }

    const stored = await Event.create({
      shop,
      event,
      data,
      createdAt: timestamp ? new Date(timestamp) : new Date(),
    });

    return json({ success: true, id: stored._id });
  } catch (err) {
    console.error("Track error:", err);
    return json({ error: "Failed to process event" }, { status: 500 });
  }
};
