// app/routes/app-proxy.track.ts
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { db } from "~/db.server";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
  "Access-Control-Allow-Headers": "content-type",
};

export async function loader({ request }: LoaderFunctionArgs) {
  await authenticate.public.appProxy(request);

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }
  return json({ ok: false, error: "Method Not Allowed" }, { status: 405, headers: CORS });
}

export async function action({ request }: ActionFunctionArgs) {
  await authenticate.public.appProxy(request);

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }
  if (request.method !== "POST") {
    return json({ ok: false, error: "Method Not Allowed" }, { status: 405, headers: CORS });
  }

  try {
    const body = await request.json();

    const eventName = String(body?.event ?? "unknown");
    const url = typeof body?.url === "string" ? body.url : "";

    const utmSource = body?.utm?.source ?? null;
    const utmMedium = body?.utm?.medium ?? null;
    const utmCampaign = body?.utm?.campaign ?? null;

    const headers = request.headers;
    const ip =
      headers.get("cf-connecting-ip") ||
      headers.get("fly-client-ip") ||
      (headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "") ||
      null;

    const userAgent = headers.get("user-agent") || (typeof body?.ua === "string" ? body.ua : null);

    await db.trackedEvent.create({
      data: {
        eventName,
        url: url || null,
        source: utmSource ?? null,
        sessionId: null,
        utmSource,
        utmMedium,
        utmCampaign,
        ip,
        userAgent,
      },
    });

    return json({ ok: true }, { status: 200, headers: CORS });
  } catch (err: any) {
    console.error("[app-proxy.track] error", err);
    return json(
      { ok: false, error: String(err?.message ?? err) },
      { status: 500, headers: CORS }
    );
  }
}
