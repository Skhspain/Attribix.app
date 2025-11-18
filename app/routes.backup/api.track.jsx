import { json } from "@remix-run/node";

let prismaClient = null;

// Lazy+safe Prisma getter that works in CJS/ESM builds
async function getPrisma() {
  if (prismaClient || !process.env.DATABASE_URL) return prismaClient;
  try {
    // Try CJS first
    // eslint-disable-next-line no-undef
    const { PrismaClient } = require("@prisma/client");
    prismaClient = new PrismaClient();
  } catch {
    // Fallback to dynamic ESM import
    const mod = await import("@prisma/client");
    const PrismaClient = mod?.PrismaClient ?? mod.default?.PrismaClient;
    prismaClient = new PrismaClient();
  }
  return prismaClient;
}

async function sendFacebookEvent({ event, data }) {
  const enabled =
    process.env.FB_ENABLED === "1" &&
    !!process.env.FB_PIXEL_ID &&
    !!process.env.FB_ACCESS_TOKEN;

  if (!enabled) return { ok: true, status: "skipped_facebook_disabled_or_missing_creds" };

  const url = `https://graph.facebook.com/v19.0/${process.env.FB_PIXEL_ID}/events`;
  const body = {
    data: [
      {
        event_name: event ?? "CustomEvent",
        event_time: Math.floor(Date.now() / 1000),
        event_source_url: data?.url ?? "http://localhost",
        action_source: "website",
        custom_data: data ?? {},
      },
    ],
    access_token: process.env.FB_ACCESS_TOKEN,
  };

  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Facebook API ${res.status}: ${text}`);
  }
  return { ok: true, status: "sent" };
}

export async function loader() {
  return json({ ok: true, hint: "POST an event here" });
}

export async function action({ request }) {
  // 1) Parse JSON safely (return 400 if invalid)
  let payload;
  try {
    payload = await request.json();
  } catch {
    return json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const response = {
    ok: true,
    received: payload,
    db: "skipped",
    saved: false,
    facebook: "skipped",
  };

  // 2) DB write is best-effort and cannot cause a 500
  try {
    if (process.env.DATABASE_URL) {
      const db = await getPrisma();
      if (db) {
        await db.event.create({
          data: {
            name: String(payload?.event ?? "UnknownEvent"),
            payload: payload?.data ?? {},
            source: "api",
          },
        });
        response.db = "ok";
        response.saved = true;
      } else {
        response.db = "skipped_prisma_not_initialized";
      }
    } else {
      response.db = "skipped_no_database_configured";
    }
  } catch (e) {
    response.db = "error";
    response.saved = false;
    response.db_error = String(e?.message ?? e);
    console.error("[api/track] DB error:", e);
  }

  // 3) Facebook send is best-effort and cannot cause a 500
  try {
    const fbRes = await sendFacebookEvent(payload);
    response.facebook = fbRes.status;
  } catch (e) {
    response.facebook = "failed";
    response.facebook_error = String(e?.message ?? e);
    console.error("[api/track] Facebook error:", e);
  }

  // Important: always 200 here (only invalid JSON returns 400)
  return json(response);
}
