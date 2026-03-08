// app/services/googleOAuth.server.ts

function invariant(cond: any, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

export async function exchangeGoogleCodeForToken(params: {
  code: string;
  redirectUri: string;
}) {
  const clientId = process.env.GOOGLE_ADS_CLIENT_ID || process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_ADS_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET;

  invariant(clientId, "Missing GOOGLE_ADS_CLIENT_ID (or GOOGLE_CLIENT_ID)");
  invariant(clientSecret, "Missing GOOGLE_ADS_CLIENT_SECRET (or GOOGLE_CLIENT_SECRET)");
  invariant(params.code, "Missing OAuth code");
  invariant(params.redirectUri, "Missing redirectUri");

  const body = new URLSearchParams();
  body.set("code", params.code);
  body.set("client_id", clientId);
  body.set("client_secret", clientSecret);
  body.set("redirect_uri", params.redirectUri);
  body.set("grant_type", "authorization_code");

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  const text = await res.text();

  if (!res.ok) {
    // This is where your earlier "Unauthorized" came from
    throw new Error(`Google token exchange failed (${res.status}): ${text.slice(0, 1200)}`);
  }

  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`Google token exchange returned non-JSON: ${text.slice(0, 1200)}`);
  }

  return json as {
    access_token: string;
    expires_in?: number;
    refresh_token?: string;
    scope?: string;
    token_type?: string;
    id_token?: string;
  };
}
