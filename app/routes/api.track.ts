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

// ✅ ADD ONLY
function pickFirstNumber(x: unknown): number | null {
  if (typeof x === "number" && Number.isFinite(x)) return x;
  if (typeof x === "string") {
    const n = Number(x);
    return Number.isFinite(n) ? n : null;
  }
  return null;
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

// ✅ ADD ONLY
function getShopFromOriginOrUrl(origin: string | null, url: string | null): string | null {
  try {
    if (origin) return new URL(origin).hostname;
  } catch {}
  try {
    if (url) return new URL(url).hostname;
  } catch {}
  return null;
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
      return corsify(json({ ok: false, error: "invalid json" }, { status: 400 }));
    }

    // super visible logging (PRESERVED) + ✅ added fields
    console.log("[/api/track] HIT", {
      origin,
      ip,
      ua: ua ? ua.slice(0, 80) : null,
      keys: Object.keys(data || {}).slice(0, 20),
      type: data?.type ?? null,
      accountID: data?.accountID ?? null,
      eventType: data?.event?.type ?? null,
      eventName: data?.event?.name ?? null,

      // ✅ Upgrade v1 (ADD ONLY)
      visitorId: data?.visitorId ?? null,
      eventId: data?.eventId ?? null,
      referrer: data?.referrer ?? null,
      clickIds: data?.clickIds ?? null,
      urlFromBody: data?.url ?? null,
      orderId: data?.orderId ?? null,
      value: data?.value ?? data?.totalValue ?? null,
      currency: data?.currency ?? null,
    });

    // ignore noise posts (PRESERVED)
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

    // ✅ Upgrade v1 (ADD ONLY)
    const shop = getShopFromOriginOrUrl(origin, url);
    const visitorId = pickFirstString(data?.visitorId);
    const eventId = pickFirstString(data?.eventId);
    const referrer = pickFirstString(data?.referrer);

    const clickIds = data?.clickIds ?? {};
    const fbclid = pickFirstString(clickIds?.fbclid);
    const gclid = pickFirstString(clickIds?.gclid);
    const ttclid = pickFirstString(clickIds?.ttclid);
    const msclkid = pickFirstString(clickIds?.msclkid);

    await db.trackedEvent.create({
      data: {
        // EXISTING (PRESERVED)
        eventName,
        createdAt: new Date(),
        url,
        source: utmSource ?? null,
        sessionId: null,
        utmSource: utmSource ?? null,
        utmMedium: utmMedium ?? null,
        utmCampaign: utmCampaign ?? null,
        ip,
        userAgent: ua,

        // ✅ Upgrade v1 fields (ADD ONLY)
        shop,
        visitorId,
        eventId,
        referrer,
        fbclid,
        gclid,
        ttclid,
        msclkid,
      },
    });

    // ✅ Upgrade v1: write Purchase too (ADD ONLY)
    // Writes ONLY when we can detect an orderId + event looks like a purchase.
    const possibleOrderId =
      pickFirstString(data?.orderId) ||
      pickFirstString(event?.orderId) ||
      pickFirstString(event?.data?.orderId) ||
      pickFirstString(event?.data?.order?.id) ||
      pickFirstString(event?.data?.checkout?.order?.id) ||
      null;

    const possibleTotal =
      pickFirstNumber(data?.totalValue) ??
      pickFirstNumber(data?.value) ??
      pickFirstNumber(event?.value) ??
      pickFirstNumber(event?.data?.totalPrice) ??
      pickFirstNumber(event?.data?.checkout?.totalPrice) ??
      null;

    const possibleCurrency =
      pickFirstString(data?.currency) ||
      pickFirstString(event?.currency) ||
      pickFirstString(event?.data?.currency) ||
      pickFirstString(event?.data?.checkout?.currency) ||
      null;

    const isPurchaseLike =
      ["purchase", "checkout_completed", "order_completed", "payment_completed"].includes(
        (eventName || "").toLowerCase()
      ) ||
      ["purchase", "checkout_completed", "order_completed", "payment_completed"].includes(
        (type || "").toLowerCase()
      );

    if (possibleOrderId && isPurchaseLike) {
      await db.purchase.upsert({
        where: { orderId: possibleOrderId },
        create: {
          createdAt: new Date(),
          totalValue: possibleTotal ?? 0,
          currency: possibleCurrency ?? "USD",

          // attribution (same as event)
          shop,
          orderId: possibleOrderId,
          visitorId,
          sessionId: null,
          utmSource: utmSource ?? null,
          utmMedium: utmMedium ?? null,
          utmCampaign: utmCampaign ?? null,
          fbclid,
          gclid,
          ttclid,
          msclkid,
        },
        update: {
          // keep updating if later events include better values
          totalValue: possibleTotal ?? undefined,
          currency: possibleCurrency ?? undefined,

          shop: shop ?? undefined,
          visitorId: visitorId ?? undefined,
          utmSource: utmSource ?? undefined,
          utmMedium: utmMedium ?? undefined,
          utmCampaign: utmCampaign ?? undefined,
          fbclid: fbclid ?? undefined,
          gclid: gclid ?? undefined,
          ttclid: ttclid ?? undefined,
          msclkid: msclkid ?? undefined,
        },
      });
    }

    return corsify(json({ ok: true, saved: true, eventName }, { status: 200 }));
  } catch (err: any) {
    console.error("[/api/track] error:", err?.message || err);
    return corsify(json({ ok: false, error: "server error" }, { status: 500 }));
  }
}