import crypto from "node:crypto";

function timingSafeEqual(a: string, b: string) {
  const aa = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (aa.length !== bb.length) return false;
  return crypto.timingSafeEqual(aa, bb);
}

/**
 * Shopify Webhook HMAC verification.
 * Header: X-Shopify-Hmac-Sha256 = base64(hmac_sha256(rawBody, apiSecret))
 */
export function verifyShopifyWebhookHmac(rawBody: string, hmacHeader: string | null, apiSecret: string) {
  if (!hmacHeader) return false;
  const digest = crypto.createHmac("sha256", apiSecret).update(rawBody, "utf8").digest("base64");
  return timingSafeEqual(digest, hmacHeader);
}

/**
 * Shopify App Proxy signature verification.
 * Query param: signature
 * Signature is HMAC-SHA256 of sorted query params (excluding signature) using apiSecret.
 */
export function verifyShopifyAppProxySignature(url: URL, apiSecret: string) {
  const signature = url.searchParams.get("signature");
  if (!signature) return false;

  const pairs: string[] = [];
  // Build sorted query string excluding signature
  [...url.searchParams.entries()]
    .filter(([k]) => k !== "signature")
    .sort(([a], [b]) => a.localeCompare(b))
    .forEach(([k, v]) => pairs.push(`${k}=${v}`));

  const msg = pairs.join("");
  const digest = crypto.createHmac("sha256", apiSecret).update(msg, "utf8").digest("hex");

  return timingSafeEqual(digest, signature);
}
