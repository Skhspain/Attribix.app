// app/utils/googleAuth.server.ts
import crypto from "crypto";

type TokenResponse = {
  access_token: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
  id_token?: string;
};

function requireEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

function base64url(input: string) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function unbase64url(input: string) {
  const s = input.replace(/-/g, "+").replace(/_/g, "/");
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  return Buffer.from(s + pad, "base64").toString("utf8");
}

export function buildGoogleAuthUrl(params: {
  shop?: string;
  returnTo?: string;
}) {
  const clientId = requireEnv("GOOGLE_CLIENT_ID");
  const redirectUri = requireEnv("GOOGLE_REDIRECT_URI");
  const scopes = requireEnv("GOOGLE_SCOPES");

  // Use your Shopify app secret to sign state (so it can’t be tampered with)
  const stateSecret =
    process.env.SHOPIFY_API_SECRET || process.env.SESSION_SECRET || "dev-secret";

  const statePayload = {
    shop: params.shop || "",
    returnTo: params.returnTo || "/app",
    nonce: crypto.randomBytes(16).toString("hex"),
    ts: Date.now(),
  };

  const stateJson = JSON.stringify(statePayload);
  const stateB64 = base64url(stateJson);
  const sig = crypto
    .createHmac("sha256", stateSecret)
    .update(stateB64)
    .digest("hex");

  const state = `${stateB64}.${sig}`;

  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", scopes);
  url.searchParams.set("access_type", "offline"); // gives refresh_token on first consent
  url.searchParams.set("prompt", "consent"); // ensures refresh_token during dev
  url.searchParams.set("include_granted_scopes", "true");
  url.searchParams.set("state", state);

  return url.toString();
}

export function verifyAndParseState(state: string) {
  const stateSecret =
    process.env.SHOPIFY_API_SECRET || process.env.SESSION_SECRET || "dev-secret";

  const [b64, sig] = String(state || "").split(".");
  if (!b64 || !sig) throw new Error("Invalid state");

  const expected = crypto
    .createHmac("sha256", stateSecret)
    .update(b64)
    .digest("hex");

  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
    throw new Error("Invalid state signature");
  }

  const json = unbase64url(b64);
  const payload = JSON.parse(json) as {
    shop?: string;
    returnTo?: string;
    nonce?: string;
    ts?: number;
  };

  // Optional freshness check (10 min)
  if (payload.ts && Date.now() - payload.ts > 10 * 60 * 1000) {
    throw new Error("State expired");
  }

  return payload;
}

export async function exchangeCodeForTokens(code: string): Promise<TokenResponse> {
  const clientId = requireEnv("GOOGLE_CLIENT_ID");
  const clientSecret = requireEnv("GOOGLE_CLIENT_SECRET");
  const redirectUri = requireEnv("GOOGLE_REDIRECT_URI");

  const body = new URLSearchParams();
  body.set("code", code);
  body.set("client_id", clientId);
  body.set("client_secret", clientSecret);
  body.set("redirect_uri", redirectUri);
  body.set("grant_type", "authorization_code");

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg =
      data?.error_description || data?.error || `Token exchange failed (${res.status})`;
    throw new Error(msg);
  }

  return data as TokenResponse;
}
