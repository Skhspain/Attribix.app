// app/services/tokenRefresh.server.ts
// Shared utility: refresh a Google OAuth token when it is expired or close to expiry.
// Used by sync routes, the conversions service, and anywhere else that calls the Google Ads API.
// ─────────────────────────────────────────────────────────────────────────────
// This file is NEW and does not modify any existing files.

import db from "~/db.server";

const BUFFER_SECONDS = 120; // refresh if token expires within 2 minutes

export type RefreshResult =
  | { ok: true; accessToken: string }
  | { ok: false; reason: string };

/**
 * Returns a valid Google access token for the given shop.
 * - If the stored token is still valid (with buffer), returns it as-is.
 * - If expired (or within the buffer window), uses the refresh token to get a new one
 *   and persists it to the DB.
 * - If no refresh token is available, returns { ok: false }.
 */
export async function getValidGoogleToken(shop: string): Promise<RefreshResult> {
  const clientId =
    process.env.GOOGLE_ADS_CLIENT_ID || process.env.GOOGLE_CLIENT_ID;
  const clientSecret =
    process.env.GOOGLE_ADS_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return { ok: false, reason: "Missing GOOGLE_ADS_CLIENT_ID / GOOGLE_ADS_CLIENT_SECRET env vars" };
  }

  const conn = await db.googleConnection.findUnique({
    where: { shop },
    select: { accessToken: true, refreshToken: true, expiresAt: true },
  });

  if (!conn) {
    return { ok: false, reason: `No Google connection found for shop ${shop}` };
  }

  // Check expiry with buffer
  const bufferMs = BUFFER_SECONDS * 1000;
  const isValid =
    conn.expiresAt &&
    conn.accessToken &&
    conn.accessToken !== "__PENDING__" &&
    new Date(conn.expiresAt).getTime() - Date.now() > bufferMs;

  if (isValid) {
    return { ok: true, accessToken: conn.accessToken! };
  }

  // Need to refresh
  if (!conn.refreshToken) {
    return {
      ok: false,
      reason: "Access token expired and no refresh token stored — user must re-authenticate",
    };
  }

  try {
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: conn.refreshToken,
        grant_type: "refresh_token",
      }),
    });

    const data = (await tokenRes.json()) as any;

    if (!tokenRes.ok || !data?.access_token) {
      const reason = data?.error_description || data?.error || `HTTP ${tokenRes.status}`;
      console.error(`[tokenRefresh] Google token refresh failed for ${shop}: ${reason}`);
      return { ok: false, reason: `Token refresh failed: ${reason}` };
    }

    const newAccessToken: string = data.access_token;
    const expiresIn: number = data.expires_in ?? 3600;
    const newExpiresAt = new Date(Date.now() + expiresIn * 1000);

    // Persist the new token
    await db.googleConnection.update({
      where: { shop },
      data: { accessToken: newAccessToken, expiresAt: newExpiresAt },
    });

    console.log(`[tokenRefresh] Refreshed Google token for ${shop}, expires ${newExpiresAt.toISOString()}`);
    return { ok: true, accessToken: newAccessToken };
  } catch (err: any) {
    const reason = err?.message ?? "Unknown error during token refresh";
    console.error(`[tokenRefresh] Exception refreshing Google token for ${shop}:`, reason);
    return { ok: false, reason };
  }
}

/**
 * Refresh Meta (Facebook) long-lived token.
 * Meta tokens last 60 days. We exchange a short-lived token for a long-lived one,
 * or extend an existing long-lived token.
 */
export async function refreshMetaToken(shop: string): Promise<RefreshResult> {
  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;

  if (!appId || !appSecret) {
    return { ok: false, reason: "Missing META_APP_ID / META_APP_SECRET env vars" };
  }

  const conn = await db.metaConnection.findUnique({
    where: { shop },
    select: { accessToken: true, expiresAt: true },
  });

  if (!conn?.accessToken || conn.accessToken === "__PENDING__") {
    return { ok: false, reason: `No valid Meta connection for shop ${shop}` };
  }

  // Check if token is still valid with buffer (7 days for Meta)
  const bufferMs = 7 * 24 * 60 * 60 * 1000;
  if (
    conn.expiresAt &&
    new Date(conn.expiresAt).getTime() - Date.now() > bufferMs
  ) {
    return { ok: true, accessToken: conn.accessToken };
  }

  // Exchange for a long-lived token
  try {
    const url = new URL("https://graph.facebook.com/v20.0/oauth/access_token");
    url.searchParams.set("grant_type", "fb_exchange_token");
    url.searchParams.set("client_id", appId);
    url.searchParams.set("client_secret", appSecret);
    url.searchParams.set("fb_exchange_token", conn.accessToken);

    const res = await fetch(url.toString());
    const data = (await res.json()) as any;

    if (!res.ok || !data?.access_token) {
      const reason = data?.error?.message || `HTTP ${res.status}`;
      console.error(`[tokenRefresh] Meta token refresh failed for ${shop}: ${reason}`);
      return { ok: false, reason: `Meta token refresh failed: ${reason}` };
    }

    const newToken: string = data.access_token;
    const expiresIn: number = data.expires_in ?? 60 * 24 * 60 * 60; // default 60 days
    const newExpiresAt = new Date(Date.now() + expiresIn * 1000);

    await db.metaConnection.update({
      where: { shop },
      data: { accessToken: newToken, expiresAt: newExpiresAt },
    });

    console.log(`[tokenRefresh] Refreshed Meta token for ${shop}, expires ${newExpiresAt.toISOString()}`);
    return { ok: true, accessToken: newToken };
  } catch (err: any) {
    const reason = err?.message ?? "Unknown error during Meta token refresh";
    console.error(`[tokenRefresh] Exception refreshing Meta token for ${shop}:`, reason);
    return { ok: false, reason };
  }
}
