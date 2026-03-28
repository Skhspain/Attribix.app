// app/routes/api.track.ts
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { db } from "~/db.server";

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
  "Access-Control-Allow-Headers": "content-type,authorization,accept",
  "Access-Control-Max-Age": "86400",
};

function corsify(res: Response) {
  Object.entries(CORS).forEach(([k, v]) => res.headers.set(k, v));
  return res;
}

function pickFirstString(x: unknown): string | null {
  return typeof x === "string" && x.trim().length ? x : null;
}

function getUtmFromUrl(url: string) {
  try {
    const u = new URL(url);
    return {
      utmSource: u.searchParams.get("utm_source"),
      utmMedium: u.searchParams.get("utm_medium"),
      utmCampaign: u.searchParams.get("utm_campaign"),
    };
  } catch {
    return { utmSource: null, utmMedium: null, utmCampaign: null };
  }
}

async function readJsonBody(request: Request) {
  const ct = request.headers.get("content-type") || "";
  if (ct.includes("application/json")) {
    return await request.json();
  }
  const text = await request.text();
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export async function loader({ request }: LoaderFunctionArgs) {
  if (request.method === "OPTIONS") return corsify(new Response(null, { status: 204 }));
  return corsify(new Response("Method not allowed", { status: 405 }));
}

export async function action({ request }: ActionFunctionArgs) {
  const method = request.method.toUpperCase();

  if (method === "OPTIONS") return corsify(new Response(null, { status: 204 }));
  if (method !== "POST") return corsify(new Response("Method not allowed", { status: 405 }));

  const origin = request.headers.get("origin") || null;
  const ua = request.headers.get("user-agent") || null;

  const ip =
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("fly-client-ip") ||
    (request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "") ||
    null;

  try {
    const data: any = await readJsonBody(request);

    if (!data) {
      console.error("[/api/track] invalid json body");
      return corsify(
        json(
          { ok: false, error: "invalid json" },
          { status: 400 }
        )
      );
    }

    // super visible logging
    console.log("[/api/track] HIT", {
      origin,
      ip,
      ua: ua ? ua.slice(0, 80) : null,
      keys: Object.keys(data || {}).slice(0, 20),
      type: data?.type ?? null,
      accountID: data?.accountID ?? null,
      eventType: data?.event?.type ?? null,
      eventName: data?.event?.name ?? null,
    });

    // ignore noise posts
    const type = pickFirstString(data?.type);
    if (!type) return corsify(new Response(null, { status: 204 }));

    const event = data?.event ?? null;

    const eventName =
      pickFirstString(type) ??
      pickFirstString(event?.name) ??
      pickFirstString(event?.type) ??
      "unknown";

    const url =
      pickFirstString(event?.context?.document?.location?.href) ??
      pickFirstString(data?.url) ??
      null;

    const { utmSource, utmMedium, utmCampaign } = getUtmFromUrl(url || "");

    // For checkout events: capture the checkout token as sessionId so we can
    // match it to the Shopify order's checkout_token when the order comes in.
    let sessionId: string | null = null;
    if (eventName === "checkout_started" || eventName === "checkout_completed") {
      sessionId =
        pickFirstString(event?.data?.checkout?.token) ??
        pickFirstString(event?.checkout?.token) ??
        null;
    }

    // For checkout events: capture customer email for fallback attribution
    const email =
      pickFirstString(event?.data?.checkout?.email) ??
      pickFirstString(event?.checkout?.email) ??
      null;

    await db.trackedEvent.create({
      data: {
        eventName,
        createdAt: new Date(),
        url,
        source: utmSource ?? null,
        sessionId,
        utmSource: utmSource ?? null,
        utmMedium: utmMedium ?? null,
        utmCampaign: utmCampaign ?? null,
        ip,
        userAgent: ua,
        email,
      },
    });

    return corsify(json({ ok: true, saved: true, eventName }, { status: 200 }));
  } catch (err: any) {
    console.error("[/api/track] error:", err?.message || err);
    return corsify(json({ ok: false, error: "server error" }, { status: 500 }));
  }
}
