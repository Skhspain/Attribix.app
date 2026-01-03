import { json, redirect } from "@remix-run/node";

export async function loader() {
  const clientId = process.env.FACEBOOK_APP_ID!;
  const redirectUri = process.env.FACEBOOK_REDIRECT_URI!;

  const url = new URL("https://www.facebook.com/v20.0/dialog/oauth");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", "attribix-shop-login");
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "ads_read");

  return redirect(url.toString());
}
