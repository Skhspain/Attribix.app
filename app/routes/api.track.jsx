import { json } from "@remix-run/node";
import { db } from "~/utils/db.server";
import { sendFacebookEvent } from "~/lib/facebook"; // ✅ Make sure path is correct

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

    // 1. Save to DB
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
        clientIp: ip,
        userAgent,
      },
    });

    // 2. Send to Facebook Conversion API
    const fbResponse = await sendFacebookEvent({
      eventName,
      eventTime: new Date(),
      email,
      phone,
      value,
      currency,
      clientIp: ip,
      userAgent,
      url,
    });

    return json({ success: true, fbStatus: fbResponse.status }, { status: 200 });
  } catch (error) {
    console.error(error);
    return json({ error: error.message }, { status: 500 });
  }
};