// app/routes/api.track.jsx
import { json } from "@remix-run/node";
import prisma from "../db.server";
import { sendFacebookEvent } from "../lib/facebook";

export const action = async ({ request }) => {
  if (request.method !== "POST") {
    return json({ ok: false, error: "Method not allowed" }, { status: 405 });
  }

  // 1) Parse body (støtter både JSON og form-data)
  let body;
  const contentType = request.headers.get("content-type") || "";

  try {
    if (contentType.includes("application/json")) {
      body = await request.json();
    } else if (contentType.includes("application/x-www-form-urlencoded")) {
      const form = await request.formData();
      const data = Object.fromEntries(form.entries());
      body = {
        event: data.event || data._event || "unknown",
        payload: data,
      };
    } else {
      // fallback: prøv JSON først, så form
      body = await request.json().catch(async () => {
        const form = await request.formData();
        const data = Object.fromEntries(form.entries());
        return { event: data.event || "unknown", payload: data };
      });
    }
  } catch (error) {
    console.error("[api/track] failed to parse body", error);
    return json({ ok: false, error: "Invalid payload" }, { status: 400 });
  }

  const eventName =
    typeof body?.event === "string" && body.event.length
      ? body.event
      : "unknown";

  const payload =
    (body && (body.payload || body.data || body.payloadData)) || {};

  let dbStatus = "skipped";
  let saved = false;

  // 2) Lagre i TrackedEvent / TrackedProduct
  try {
    if (process.env.DATABASE_URL) {
      const {
        url,
        href,
        path,
        utm_source,
        utm_medium,
        utm_campaign,
        value,
        currency,
        email,
        phone,
        session_id,
        sessionId,
        ip,
        userAgent,
        products,
        items,
        timestamp,
        ...rest
      } = payload;

      const productArray = Array.isArray(products)
        ? products
        : Array.isArray(items)
        ? items
        : [];

      await prisma.trackedEvent.create({
        data: {
          eventName,
          url:
            typeof url === "string"
              ? url
              : typeof href === "string"
              ? href
              : null,
          utmSource:
            typeof utm_source === "string"
              ? utm_source
              : typeof rest.utmSource === "string"
              ? rest.utmSource
              : null,
          utmMedium:
            typeof utm_medium === "string"
              ? utm_medium
              : typeof rest.utmMedium === "string"
              ? rest.utmMedium
              : null,
          utmCampaign:
            typeof utm_campaign === "string"
              ? utm_campaign
              : typeof rest.utmCampaign === "string"
              ? rest.utmCampaign
              : null,
          value:
            typeof value === "number"
              ? value
              : typeof rest.value === "number"
              ? rest.value
              : null,
          currency:
            typeof currency === "string"
              ? currency
              : typeof rest.currency === "string"
              ? rest.currency
              : null,
          email:
            typeof email === "string"
              ? email
              : typeof rest.email === "string"
              ? rest.email
              : null,
          phone:
            typeof phone === "string"
              ? phone
              : typeof rest.phone === "string"
              ? rest.phone
              : null,
          ip:
            typeof ip === "string"
              ? ip
              : typeof rest.ip === "string"
              ? rest.ip
              : null,
          userAgent:
            typeof userAgent === "string"
              ? userAgent
              : typeof rest.user_agent === "string"
              ? rest.user_agent
              : null,
          sessionId:
            typeof session_id === "string"
              ? session_id
              : typeof sessionId === "string"
              ? sessionId
              : typeof rest.sessionId === "string"
              ? rest.sessionId
              : null,
          timestamp: timestamp
            ? new Date(
                typeof timestamp === "number" ? timestamp : String(timestamp),
              )
            : undefined,
          products: {
            create: productArray
              .filter((p) => p && typeof p === "object")
              .map((p) => ({
                productId:
                  "productId" in p && p.productId != null
                    ? String(p.productId)
                    : null,
                productName:
                  "productName" in p && typeof p.productName === "string"
                    ? p.productName
                    : null,
                quantity:
                  "quantity" in p && typeof p.quantity === "number"
                    ? p.quantity
                    : null,
              })),
          },
        },
      });

      dbStatus = "ok";
      saved = true;
    }
  } catch (error) {
    console.error("[api/track] DB error:", error);
    dbStatus = "error";
    saved = false;
  }

  // 3) Meta forwarding (guardert av FB_ENABLED)
  let facebook = "skipped";
  try {
    const fbRes = await sendFacebookEvent({
      event: eventName,
      data: {
        event_source_url:
          payload.url || payload.href || payload.path || undefined,
        action_source: payload.action_source || "website",
        value: payload.value,
        currency: payload.currency,
      },
    });
    facebook = fbRes.ok ? "ok" : "error";
  } catch (error) {
    console.error("[api/track] Facebook error:", error);
    facebook = "error";
  }

  return json({
    ok: true,
    event: eventName,
    db: dbStatus,
    saved,
    facebook,
  });
};

export default function Route() {
  return null;
}
