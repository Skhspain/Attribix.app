type GoogleTokenResponse = {
  access_token: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
  id_token?: string;
};

export async function exchangeGoogleCodeForToken(params: {
  code: string;
  redirectUri: string;
}) {
  const clientId = process.env.GOOGLE_ADS_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_ADS_CLIENT_SECRET;

  if (!clientId) throw new Error("Missing GOOGLE_ADS_CLIENT_ID");
  if (!clientSecret) throw new Error("Missing GOOGLE_ADS_CLIENT_SECRET");

  const body = new URLSearchParams();
  body.set("code", params.code);
  body.set("client_id", clientId);
  body.set("client_secret", clientSecret);
  body.set("redirect_uri", params.redirectUri);
  body.set("grant_type", "authorization_code");

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });

  const json = (await res.json()) as any;

  if (!res.ok) {
    const msg = json?.error_description || json?.error || "Token exchange failed";
    throw new Error(msg);
  }

  return json as GoogleTokenResponse;
}
