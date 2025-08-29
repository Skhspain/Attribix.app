import { json } from "@remix-run/node";
import { db } from "~/utils/db.server";

export const loader = async () => {
  return json({ error: "Method Not Allowed" }, { status: 405 });
};

export const action = async ({ request }) => {
  if (request.method !== "POST") {
    return json({ error: "Method Not Allowed" }, { status: 405 });
  }

  try {
    const {
      eventName,
      url,
      utmSource,
      utmMedium,
      utmCampaign,
      value,
      currency,
      email,
      phone,
    } = await request.json();

    const headers = request.headers;
    const ip =
      headers.get("cf-connecting-ip") ||
      (headers.get("x-forwarded-for")?.split(",")[0].trim()) ||
      "";
    const userAgent = headers.get("user-agent") || "";

    await db.trackedEvent.create({
      data: {
        eventName,
        url,
        utmSource,
        utmMedium,
        utmCampaign,
        value,
        currency,
        email,
        phone,
        ip,
        userAgent,
      },
    });

    return json({ success: true }, { status: 200 });
  } catch (error) {
    console.error(error);
    return json({ error: error.message }, { status: 500 });
  }
};
