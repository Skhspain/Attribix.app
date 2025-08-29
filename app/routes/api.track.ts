// app/routes/api.track.ts
import type { ActionFunctionArgs } from "@remix-run/node";
import { createCookie } from "@remix-run/node";
import prisma from "~/utils/db.server";


const sessionCookie = createCookie("ax_sid", {
  httpOnly: true,
  sameSite: "lax",
  path: "/",
  maxAge: 60 * 60 * 24 * 365, // 1 year
});

// Simple CORS helpers (adjust origin as needed)
function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}
function withCors(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders() },
  });
}

export async function action({ request }: ActionFunctionArgs) {
  if (request.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders() });
  }
  if (request.method !== "POST") {
    return withCors(405, { error: "Method not allowed" });
  }

  const body = await request.json().catch(() => ({} as any));

  const {
    eventName = "page_view",
    url,
    path,
    referrer,
    value,
    currency,
    anonId,
    clientId,
    userAgent,
    ip,
    utm_source,
    utm_medium,
    utm_campaign,
    utm_content,
    utm_term,
    gclid,
    fbclid,
    ttclid,
    msclkid,
    consentAdvertising,
    consentMarketing,
  } = body || {};

  const cookies = request.headers.get("cookie") || "";
  let sid = (await sessionCookie.parse(cookies)) as string | undefined;

  const now = new Date();

  // Create or update WebSession
  let webSession = sid ? await prisma.webSession.findUnique({ where: { id: sid } }) : null;

  if (!webSession) {
    webSession = await prisma.webSession.create({
      data: {
        firstTouchAt: now,
        lastTouchAt: now,
        anonId,
        clientId,
        userAgent,
        consentAdvertising: consentAdvertising ?? false,
        consentMarketing: consentMarketing ?? false,
        utmSource: utm_source ?? undefined,
        utmMedium: utm_medium ?? undefined,
        utmCampaign: utm_campaign ?? undefined,
        utmContent: utm_content ?? undefined,
        utmTerm: utm_term ?? undefined,
        gclid: gclid ?? undefined,
        fbclid: fbclid ?? undefined,
        ttclid: ttclid ?? undefined,
        msclkid: msclkid ?? undefined,
      },
    });
    sid = webSession.id;
  } else {
    await prisma.webSession.update({
      where: { id: webSession.id },
      data: {
        lastTouchAt: now,
        userAgent: userAgent ?? webSession.userAgent,
        consentAdvertising: consentAdvertising ?? webSession.consentAdvertising,
        consentMarketing: consentMarketing ?? webSession.consentMarketing,
        utmSource: utm_source ?? webSession.utmSource,
        utmMedium: utm_medium ?? webSession.utmMedium,
        utmCampaign: utm_campaign ?? webSession.utmCampaign,
        utmContent: utm_content ?? webSession.utmContent,
        utmTerm: utm_term ?? webSession.utmTerm,
        gclid: gclid ?? webSession.gclid,
        fbclid: fbclid ?? webSession.fbclid,
        ttclid: ttclid ?? webSession.ttclid,
        msclkid: msclkid ?? webSession.msclkid,
      },
    });
  }

  // Create TrackedEvent
  await prisma.trackedEvent.create({
    data: {
      eventName,
      url: url ?? path ?? null,
      path: path ?? null,
      referrer: referrer ?? null,
      value: value ?? null,
      currency: currency ?? null,
      ip: ip ?? null,
      userAgent: userAgent ?? null,
      utmSource: utm_source ?? null,
      utmMedium: utm_medium ?? null,
      utmCampaign: utm_campaign ?? null,
      gclid: gclid ?? null,
      fbclid: fbclid ?? null,
      ttclid: ttclid ?? null,
      msclkid: msclkid ?? null,
      sessionId: sid!,
    },
  });

  const headers = {
    ...corsHeaders(),
    "Set-Cookie": await sessionCookie.serialize(sid!),
  };
  return new Response(JSON.stringify({ ok: true, sid }), { status: 200, headers });
}

export function loader() {
  return withCors(405, { error: "Method not allowed" });
}
