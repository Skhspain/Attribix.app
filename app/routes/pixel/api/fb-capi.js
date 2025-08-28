// app/routes/apps/pixel/api/fb-capi.js

import { json } from "@remix-run/node";
import { getSettings } from "~/settings.server";

export const action = async ({ request }) => {
  const { pixelId } = await getSettings();
  const { eventId, order } = await request.json();

  if (!pixelId || !eventId || !order) {
    return json({ error: "Missing data" }, { status: 400 });
  }

  // Build CAPI payload
  const payload = {
    event_name: "Purchase",
    event_time: Math.floor(Date.now() / 1000),
    event_id: eventId,
    user_data: {
      // advanced matching could go here (email, phone hashed)
      client_ip_address: request.headers.get("x-forwarded-for")?.split(",")[0],
      client_user_agent: request.headers.get("user-agent"),
    },
    custom_data: {
      currency: order.currency,
      value: parseFloat(order.subtotal_price),
      contents: order.line_items.map(i => ({
        id: i.product_id.toString(),
        quantity: i.quantity
      }))
    },
    data_processing_options: [],   // as required by your region
    access_token: process.env.FB_ACCESS_TOKEN,
  };

  // Fire to Facebook CAPI
  const resp = await fetch(
    `https://graph.facebook.com/v16.0/${pixelId}/events`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }
  );

  if (!resp.ok) {
    const text = await resp.text();
    return json({ error: text }, { status: resp.status });
  }

  return json({ success: true });
};