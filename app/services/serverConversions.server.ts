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
    google?: { ok: boolean; status?: number; body?: unknown; skipped?: boolean; reason?: string };
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

  // ── Google Ads offline conversion upload (gclid-required) ──────────────
  try {
    const googleConversionActionId = process.env.GOOGLE_ADS_CONVERSION_ACTION_ID;
    const googleDeveloperToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
    const googleClientId = process.env.GOOGLE_ADS_CLIENT_ID;
    const googleClientSecret = process.env.GOOGLE_ADS_CLIENT_SECRET;
    const googleLoginCustomerId = process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID;

    // Only attempt upload when we have a gclid to match against
    if (!input.gclid) {
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

  return results;
}