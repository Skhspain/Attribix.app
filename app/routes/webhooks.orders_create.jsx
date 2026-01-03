// app/routes/webhooks.orders_create.jsx
import { authenticate } from "../shopify.server"; // adjust if your path differs
import crypto from "crypto";
import {
  logInfo,
  logWarn,
  logError,
  logDebug,
  fingerprint,
} from "../utils/log.server"; // adjust path if needed

/* -----------------------------------------------------
   Normalization + hashing helpers (Meta CAPI expects SHA-256)
----------------------------------------------------- */
function normEmail(v) {
  if (!v) return null;
  const s = String(v).trim().toLowerCase();
  return s ? s : null;
}

function normPhone(v) {
  if (!v) return null;
  // Keep digits and leading +
  const s = String(v).trim().replace(/[^\d+]/g, "");
  return s ? s : null;
}

function normGeneric(v) {
  if (!v) return null;
  const s = String(v).trim().toLowerCase();
  return s ? s : null;
}

function sha256Hex(value) {
  if (!value) return null;
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

function toUnixSeconds(v) {
  try {
    if (!v) return Math.floor(Date.now() / 1000);
    const d = new Date(v);
    const t = d.getTime();
    if (!Number.isFinite(t)) return Math.floor(Date.now() / 1000);
    return Math.floor(t / 1000);
  } catch {
    return Math.floor(Date.now() / 1000);
  }
}

function pickFirst(...vals) {
  for (const v of vals) {
    if (v === null || v === undefined) continue;
    const s = String(v).trim();
    if (s) return s;
  }
  return null;
}

function getHeader(request, name) {
  return (
    request.headers.get(name) ||
    request.headers.get(name.toLowerCase()) ||
    undefined
  );
}

function getClientInfo(request) {
  const ua = getHeader(request, "user-agent");
  // Fly often passes client IP in X-Forwarded-For; take first value.
  const xff = getHeader(request, "x-forwarded-for");
  const ip = xff ? String(xff).split(",")[0].trim() : undefined;
  return { ip, ua };
}

async function sendMetaCapi({ pixelId, accessToken, testEventCode, event }) {
  const url = `https://graph.facebook.com/v20.0/${pixelId}/events`;

  const payload = {
    data: [event],
    ...(testEventCode ? { test_event_code: testEventCode } : {}),
    access_token: accessToken,
  };

  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });

  let data;
  try {
    data = await res.json();
  } catch {
    data = { parse_error: true };
  }

  return { ok: res.ok, status: res.status, data };
}

function metaErrorShape(data) {
  const err = data?.error;
  if (!err) return undefined;
  return {
    message: err.message,
    type: err.type,
    code: err.code,
    error_subcode: err.error_subcode,
    fbtrace_id: err.fbtrace_id,
    error_user_title: err.error_user_title,
    // keep user msg (helpful) but it contains no PII
    error_user_msg: err.error_user_msg,
  };
}

export async function action({ request }) {
  // Keep webhook responses fast + never throw hard
  try {
    const { topic, shop, payload } = await authenticate.webhook(request);

    // --- env flags ---
    const fbEnabled = String(process.env.FB_ENABLED || "0") === "1";
    const pixelId = process.env.FB_PIXEL_ID || "";
    const accessToken = process.env.FB_ACCESS_TOKEN || "";
    const testEventCode = process.env.FB_TEST_EVENT_CODE || "";

    // --- minimal structured “receipt” log (no PII) ---
    const orderId = payload?.id ? String(payload.id) : undefined;

    // Shopify orders often have email/phone in different places depending on checkout
    const rawEmail = pickFirst(
      payload?.email,
      payload?.customer?.email,
      payload?.contact_email
    );

    const rawPhone = pickFirst(
      payload?.phone,
      payload?.customer?.phone,
      payload?.billing_address?.phone,
      payload?.shipping_address?.phone
    );

    logInfo("[orders_create] webhook received", {
      topic,
      shop,
      orderId,
      // fingerprints let you correlate without leaking the raw value
      emailFp: fingerprint(rawEmail),
      phoneFp: fingerprint(rawPhone),
      fbEnabled,
      hasPixelId: Boolean(pixelId),
      hasAccessToken: Boolean(accessToken),
      hasTestEventCode: Boolean(testEventCode),
    });

    if (!fbEnabled) {
      return new Response(JSON.stringify({ ok: true, skipped: "fb_disabled" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    if (!pixelId || !accessToken) {
      logWarn("[orders_create] Meta CAPI skipped: missing config", {
        hasPixelId: Boolean(pixelId),
        hasAccessToken: Boolean(accessToken),
      });

      return new Response(
        JSON.stringify({ ok: true, skipped: "missing_meta_env" }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        }
      );
    }

    const { ip, ua } = getClientInfo(request);

    // --- Build Meta Purchase event (with identifiers) ---
    const value = Number(payload?.total_price || 0);
    const currency = String(payload?.currency || "USD");

    // Prefer order timestamp if present
    const eventTime = toUnixSeconds(payload?.created_at);

    // Pull extra fields for better match rate
    const rawFirstName = pickFirst(
      payload?.billing_address?.first_name,
      payload?.customer?.first_name,
      payload?.shipping_address?.first_name
    );
    const rawLastName = pickFirst(
      payload?.billing_address?.last_name,
      payload?.customer?.last_name,
      payload?.shipping_address?.last_name
    );

    const rawCity = pickFirst(
      payload?.billing_address?.city,
      payload?.shipping_address?.city
    );
    const rawState = pickFirst(
      payload?.billing_address?.province,
      payload?.shipping_address?.province
    );
    const rawZip = pickFirst(
      payload?.billing_address?.zip,
      payload?.shipping_address?.zip
    );
    const rawCountry = pickFirst(
      payload?.billing_address?.country_code,
      payload?.shipping_address?.country_code,
      payload?.billing_address?.country,
      payload?.shipping_address?.country
    );

    const email = normEmail(rawEmail);
    const phone = normPhone(rawPhone);
    const fn = normGeneric(rawFirstName);
    const ln = normGeneric(rawLastName);
    const ct = normGeneric(rawCity);
    const st = normGeneric(rawState);
    const zp = normGeneric(rawZip);
    const country = normGeneric(rawCountry);

    const customerId = payload?.customer?.id ? String(payload.customer.id) : null;
    const externalId = customerId ? sha256Hex(customerId) : null;

    // Build user_data WITHOUT undefined keys (JSON.stringify drops undefined, but keep it clean)
    const user_data = {};

    // Meta expects arrays of hashes for these fields
    if (email) user_data.em = [sha256Hex(email)];
    if (phone) user_data.ph = [sha256Hex(phone)];
    if (fn) user_data.fn = [sha256Hex(fn)];
    if (ln) user_data.ln = [sha256Hex(ln)];
    if (ct) user_data.ct = [sha256Hex(ct)];
    if (st) user_data.st = [sha256Hex(st)];
    if (zp) user_data.zp = [sha256Hex(zp)];
    if (country) user_data.country = [sha256Hex(country)];
    if (externalId) user_data.external_id = [externalId];

    // These help but may not be the real shopper IP/UA in a webhook; include anyway if present
    if (ip) user_data.client_ip_address = ip;
    if (ua) user_data.client_user_agent = ua;

    const event = {
      event_name: "Purchase",
      event_time: eventTime,
      action_source: "website",
      event_id: orderId, // useful for dedupe if you later add pixel-side Purchase with same event_id
      user_data,
      custom_data: {
        currency,
        value,
        order_id: orderId,
      },
    };

    // Redacted debug log
    logDebug("[orders_create] Meta CAPI sending (redacted)", {
      pixelIdTail: pixelId ? pixelId.slice(-6) : undefined,
      event_name: event.event_name,
      event_id: event.event_id,
      currency,
      value,
      hasIp: Boolean(ip),
      hasUa: Boolean(ua),
      hasEmail: Boolean(email),
      hasPhone: Boolean(phone),
      hasName: Boolean(fn || ln),
      hasAddr: Boolean(ct || st || zp || country),
      hasExternalId: Boolean(externalId),
      testEvent: Boolean(testEventCode),
    });

    const capi = await sendMetaCapi({
      pixelId,
      accessToken,
      testEventCode,
      event,
    });

    if (capi.ok) {
      logInfo("[orders_create] Meta CAPI ok", {
        status: capi.status,
        events_received: capi.data?.events_received,
        fbtrace_id: capi.data?.fbtrace_id,
        eventId: orderId,
      });
    } else {
      logWarn("[orders_create] Meta CAPI error", {
        status: capi.status,
        eventId: orderId,
        error: metaErrorShape(capi.data),
      });
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  } catch (err) {
    // never fail the webhook hard
    logError("[orders_create] webhook handler failed", {
      err: String(err?.message || err),
    });

    return new Response(JSON.stringify({ ok: true, swallowed: true }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }
}
