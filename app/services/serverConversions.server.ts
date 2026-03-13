// app/services/serverConversions.server.ts
import crypto from "node:crypto";

type SendServerConversionInput = {
  eventName: string;
  eventTime?: number;
  eventId?: string | null;
  orderId?: string | null;
  value?: number | null;
  currency?: string | null;
  url?: string | null;
  sourceUrl?: string | null;
  actionSource?: "website";
  shop?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  email?: string | null;
  phone?: string | null;
  fbclid?: string | null;
  fbc?: string | null;
  fbp?: string | null;
  gclid?: string | null;
  externalId?: string | null;
};

function sha256(value: string) {
  return crypto.createHash("sha256").update(value.trim().toLowerCase()).digest("hex");
}

function hashIfPresent(value?: string | null) {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return sha256(trimmed);
}

function buildFbcFromFbclid(fbclid?: string | null) {
  if (!fbclid) return undefined;
  return `fb.1.${Date.now()}.${fbclid}`;
}

function getMetaPixelId() {
  return (
    process.env.META_PIXEL_ID ||
    process.env.FB_PIXEL_ID ||
    null
  );
}

function getMetaAccessToken() {
  return (
    process.env.META_CONVERSIONS_API_ACCESS_TOKEN ||
    process.env.FB_ACCESS_TOKEN ||
    process.env.FACEBOOK_ACCESS_TOKEN ||
    null
  );
}

function buildMetaPayload(input: SendServerConversionInput) {
  const user_data: Record<string, unknown> = {};

  if (input.ip) user_data.client_ip_address = input.ip;
  if (input.userAgent) user_data.client_user_agent = input.userAgent;

  const finalFbc = input.fbc || buildFbcFromFbclid(input.fbclid);
  if (finalFbc) user_data.fbc = finalFbc;
  if (input.fbp) user_data.fbp = input.fbp;

  if (input.externalId) user_data.external_id = [hashIfPresent(input.externalId)].filter(Boolean);
  if (input.email) user_data.em = [hashIfPresent(input.email)].filter(Boolean);
  if (input.phone) user_data.ph = [hashIfPresent(input.phone)].filter(Boolean);

  return {
    data: [
      {
        event_name: input.eventName,
        event_time: input.eventTime || Math.floor(Date.now() / 1000),
        event_id: input.eventId || undefined,
        action_source: input.actionSource || "website",
        event_source_url: input.sourceUrl || input.url || undefined,
        user_data,
        custom_data: {
          currency: input.currency || "USD",
          value: typeof input.value === "number" ? input.value : 0,
          order_id: input.orderId || undefined,
        },
      },
    ],
  };
}

export async function sendServerConversions(input: SendServerConversionInput) {
  const results: {
    meta?: { ok: boolean; status?: number; body?: unknown; skipped?: boolean; reason?: string };
    google?: { ok: boolean; skipped?: boolean; reason?: string };
  } = {};

  const metaPixelId = getMetaPixelId();
  const metaAccessToken = getMetaAccessToken();

  if (metaPixelId && metaAccessToken) {
    try {
      const payload = buildMetaPayload(input);

      const response = await fetch(
        `https://graph.facebook.com/v21.0/${metaPixelId}/events?access_token=${encodeURIComponent(
          metaAccessToken,
        )}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        },
      );

      let body: unknown = null;
      try {
        body = await response.json();
      } catch {
        body = null;
      }

      results.meta = {
        ok: response.ok,
        status: response.status,
        body,
      };
    } catch (error: any) {
      results.meta = {
        ok: false,
        reason: error?.message || "meta request failed",
      };
    }
  } else {
    results.meta = {
      ok: false,
      skipped: true,
      reason:
        "Missing Meta pixel/access token env vars. Checked META_PIXEL_ID, FB_PIXEL_ID, META_CONVERSIONS_API_ACCESS_TOKEN, FB_ACCESS_TOKEN, FACEBOOK_ACCESS_TOKEN",
    };
  }

  const googleConversionActionId = process.env.GOOGLE_ADS_CONVERSION_ACTION_ID;
  const googleDeveloperToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
  const googleCustomerId = process.env.GOOGLE_ADS_CUSTOMER_ID;
  const googleLoginCustomerId = process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID;
  const googleRefreshToken = process.env.GOOGLE_ADS_REFRESH_TOKEN;
  const googleClientId = process.env.GOOGLE_ADS_CLIENT_ID;
  const googleClientSecret = process.env.GOOGLE_ADS_CLIENT_SECRET;

  if (
    googleConversionActionId &&
    googleDeveloperToken &&
    googleCustomerId &&
    googleRefreshToken &&
    googleClientId &&
    googleClientSecret &&
    googleLoginCustomerId
  ) {
    results.google = {
      ok: false,
      skipped: true,
      reason:
        "Google Ads server-side forwarding foundation is wired, but the authenticated upload call is not implemented in this helper yet.",
    };
  } else {
    results.google = {
      ok: false,
      skipped: true,
      reason: "Google Ads environment variables are not fully configured",
    };
  }

  return results;
}