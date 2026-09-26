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
  ttclid?: string | null;
  externalId?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  city?: string | null;
  zip?: string | null;
  state?: string | null;
  country?: string | null;
  contentIds?: string[] | null;
  contentType?: string | null;
  numItems?: number | null;
  searchString?: string | null;
  // Per-shop credentials — take precedence over global env vars.
  // Populated from trackingSettings.fbPixelId / fbToken for multi-tenant correctness.
  shopPixelId?: string | null;
  shopToken?: string | null;
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

// Meta match keys must be normalized before hashing or they never match:
// phone = digits only (with country code), zip/city = no spaces, names = no punctuation.
function hashNormalized(value: string | null | undefined, strip: RegExp) {
  if (!value) return undefined;
  const cleaned = value.trim().toLowerCase().replace(strip, "");
  return cleaned ? sha256(cleaned) : undefined;
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

function buildMetaCustomData(input: SendServerConversionInput) {
  const custom_data: Record<string, unknown> = {};
  const hasValue = typeof input.value === "number" && Number.isFinite(input.value);
  // Purchase always needs value + currency; other events only send them when known,
  // so we don't report a fake "0 USD" for every product view.
  if (hasValue || input.eventName === "Purchase") {
    custom_data.value = hasValue ? input.value : 0;
    custom_data.currency = input.currency || "USD";
  } else if (input.currency) {
    custom_data.currency = input.currency;
  }
  if (input.orderId) custom_data.order_id = input.orderId;
  if (input.contentIds?.length) {
    custom_data.content_ids = input.contentIds;
    custom_data.content_type = input.contentType || "product";
  }
  if (typeof input.numItems === "number") custom_data.num_items = input.numItems;
  if (input.searchString) custom_data.search_string = input.searchString;
  return custom_data;
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
  if (input.phone) user_data.ph = [hashNormalized(input.phone, /\D/g)].filter(Boolean);
  if (input.firstName) user_data.fn = [hashNormalized(input.firstName, /[\s\p{P}]/gu)].filter(Boolean);
  if (input.lastName) user_data.ln = [hashNormalized(input.lastName, /[\s\p{P}]/gu)].filter(Boolean);
  if (input.city) user_data.ct = [hashNormalized(input.city, /[\s\p{P}]/gu)].filter(Boolean);
  if (input.zip) user_data.zp = [hashNormalized(input.zip, /[\s-]/g)].filter(Boolean);
  if (input.state) user_data.st = [hashIfPresent(input.state)].filter(Boolean);
  if (input.country) user_data.country = [hashIfPresent(input.country)].filter(Boolean);

  return {
    data: [
      {
        event_name: input.eventName,
        event_time: input.eventTime || Math.floor(Date.now() / 1000),
        event_id: input.eventId || undefined,
        action_source: input.actionSource || "website",
        event_source_url: input.sourceUrl || input.url || undefined,
        user_data,
        custom_data: buildMetaCustomData(input),
      },
    ],
  };
}

function buildTiktokPayload(input: SendServerConversionInput, pixelCode: string) {
  const user: Record<string, unknown> = {};
  if (input.email) user.email = hashIfPresent(input.email);
  if (input.phone) user.phone_number = hashIfPresent(input.phone);
  if (input.externalId) user.external_id = hashIfPresent(input.externalId);

  const context: Record<string, unknown> = { user };
  if (input.ip) context.ip = input.ip;
  if (input.userAgent) context.user_agent = input.userAgent;
  const pageUrl = input.sourceUrl || input.url;
  if (pageUrl) context.page = { url: pageUrl };
  if (input.ttclid) context.ad = { callback: input.ttclid };

  const eventTime = input.eventTime ?? Math.floor(Date.now() / 1000);

  return {
    pixel_code: pixelCode,
    event: "PlaceAnOrder",
    event_id: input.eventId || undefined,
    timestamp: new Date(eventTime * 1000).toISOString(),
    context,
    properties: {
      currency: input.currency || "USD",
      value: typeof input.value === "number" ? input.value : 0,
      order_id: input.orderId || undefined,
      content_type: "product",
    },
    partner_name: "Attribix",
  };
}

export async function sendServerConversions(input: SendServerConversionInput) {
  const results: {
    meta?: { ok: boolean; status?: number; body?: unknown; skipped?: boolean; reason?: string };
    google?: { ok: boolean; status?: number; body?: unknown; skipped?: boolean; reason?: string };
    tiktok?: { ok: boolean; status?: number; body?: unknown; skipped?: boolean; reason?: string };
  } = {};

  // Per-shop credentials take precedence over global env vars so that in a
  // multi-tenant deployment each shop's events go to the right Meta pixel.
  const metaPixelId = input.shopPixelId?.trim() || getMetaPixelId();
  const metaAccessToken = input.shopToken?.trim() || getMetaAccessToken();

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

  // ── Google Ads offline conversion upload (gclid-required) ──────────────
  try {
    const googleConversionActionId = process.env.GOOGLE_ADS_CONVERSION_ACTION_ID;
    const googleDeveloperToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
    const googleClientId = process.env.GOOGLE_ADS_CLIENT_ID;
    const googleClientSecret = process.env.GOOGLE_ADS_CLIENT_SECRET;
    const googleLoginCustomerId = process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID;

    // Only Purchase is a conversion for Google Ads — funnel events (ViewContent,
    // InitiateCheckout, …) must never be uploaded to the purchase conversion action.
    if (input.eventName !== "Purchase") {
      results.google = { ok: false, skipped: true, reason: "Not a Purchase event" };
    } else if (!input.gclid) {
      results.google = { ok: false, skipped: true, reason: "No gclid — skipping Google Ads upload" };
    } else if (!googleConversionActionId || !googleDeveloperToken || !googleClientId || !googleClientSecret) {
      results.google = { ok: false, skipped: true, reason: "Google Ads environment variables are not fully configured" };
    } else {
      // Look up the shop's Google connection for customer ID + refresh token
      let customerId: string | null = null;
      let accessToken: string | null = null;

      if (input.shop) {
        try {
          const { db } = await import("~/db.server");
          const conn = await (db as any).googleConnection?.findUnique?.({
            where: { shop: input.shop },
            select: { adCustomerId: true, refreshToken: true, accessToken: true, expiresAt: true },
          });

          if (conn?.adCustomerId) {
            customerId = conn.adCustomerId;

            // Refresh the access token if expired or missing
            const expired = conn.expiresAt ? new Date(conn.expiresAt) < new Date() : true;
            if (!expired && conn.accessToken) {
              accessToken = conn.accessToken;
            } else if (conn.refreshToken) {
              const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
                method: "POST",
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
                body: new URLSearchParams({
                  client_id: googleClientId,
                  client_secret: googleClientSecret,
                  refresh_token: conn.refreshToken,
                  grant_type: "refresh_token",
                }),
              });
              const tokenData = await tokenRes.json() as any;
              if (tokenData?.access_token) {
                accessToken = tokenData.access_token;
                // Update stored token
                const newExpiry = new Date(Date.now() + (tokenData.expires_in ?? 3600) * 1000);
                await (db as any).googleConnection?.update?.({
                  where: { shop: input.shop },
                  data: { accessToken: tokenData.access_token, expiresAt: newExpiry },
                }).catch(() => {});
              }
            }
          }
        } catch (dbErr: any) {
          // Non-fatal: continue without Google connection
        }
      }

      if (!customerId || !accessToken) {
        results.google = { ok: false, skipped: true, reason: "No Google Ads customer or valid access token for this shop" };
      } else {
        const cleanCustomerId = customerId.replace(/-/g, "");
        const conversionDateTime = new Date(
          (input.eventTime ?? Math.floor(Date.now() / 1000)) * 1000
        ).toISOString().replace("T", " ").replace(/\.\d+Z$/, "+00:00");

        const uploadPayload = {
          conversions: [{
            gclid: input.gclid,
            conversionAction: `customers/${cleanCustomerId}/conversionActions/${googleConversionActionId}`,
            conversionDateTime,
            conversionValue: typeof input.value === "number" ? input.value : 0,
            currencyCode: input.currency || "USD",
            orderId: input.orderId || undefined,
          }],
          partialFailure: true,
        };

        const googleApiVersion = process.env.GOOGLE_ADS_API_VERSION || "v17";
        const uploadRes = await fetch(
          `https://googleads.googleapis.com/${googleApiVersion}/customers/${cleanCustomerId}:uploadClickConversions`,
          {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${accessToken}`,
              "developer-token": googleDeveloperToken,
              "Content-Type": "application/json",
              ...(googleLoginCustomerId ? { "login-customer-id": googleLoginCustomerId.replace(/-/g, "") } : {}),
            },
            body: JSON.stringify(uploadPayload),
          }
        );

        let uploadBody: unknown = null;
        try { uploadBody = await uploadRes.json(); } catch {}

        results.google = {
          ok: uploadRes.ok,
          status: uploadRes.status,
          body: uploadBody,
        };
      }
    }
  } catch (googleError: any) {
    results.google = { ok: false, reason: googleError?.message || "Google Ads upload failed" };
  }

  // ── TikTok Events API ───────────────────────────────────────────────────
  try {
    const tiktokPixelId = process.env.TIKTOK_PIXEL_ID;
    const tiktokAccessToken = process.env.TIKTOK_ACCESS_TOKEN;

    // The TikTok payload is hard-wired to PlaceAnOrder, so only forward purchases.
    if (input.eventName !== "Purchase") {
      results.tiktok = { ok: false, skipped: true, reason: "Not a Purchase event" };
    } else if (!tiktokPixelId || !tiktokAccessToken) {
      results.tiktok = { ok: false, skipped: true, reason: "TIKTOK_PIXEL_ID / TIKTOK_ACCESS_TOKEN not configured" };
    } else {
      const tiktokPayload = buildTiktokPayload(input, tiktokPixelId);

      const tiktokRes = await fetch(
        "https://business-api.tiktok.com/open_api/v1.3/event/track/",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Access-Token": tiktokAccessToken,
          },
          body: JSON.stringify(tiktokPayload),
        },
      );

      let tiktokBody: unknown = null;
      try { tiktokBody = await tiktokRes.json(); } catch {}

      results.tiktok = { ok: tiktokRes.ok, status: tiktokRes.status, body: tiktokBody };
    }
  } catch (tiktokError: any) {
    results.tiktok = { ok: false, reason: tiktokError?.message || "TikTok Events API failed" };
  }

  return results;
}
/**
 * Claims the right to send the Purchase conversion for an order. The thank-you
 * page, the orders/create webhook and Shopify's webhook retries all see the same
 * order; only the first claim wins, so each platform gets one Purchase per order.
 * The Purchase row must already exist (both paths upsert it first).
 */
export async function claimPurchaseConversion(orderId: string): Promise<boolean> {
  const { db } = await import("~/db.server");
  const res = await db.purchase.updateMany({
    where: { orderId, capiSentAt: null },
    data: { capiSentAt: new Date() },
  });
  return res.count > 0;
}

/** Undo a claim when sending failed outright, so the other path can retry. */
export async function releasePurchaseConversion(orderId: string) {
  const { db } = await import("~/db.server");
  await db.purchase.updateMany({ where: { orderId }, data: { capiSentAt: null } }).catch(() => null);
}
