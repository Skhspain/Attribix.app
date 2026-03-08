// app/routes/auth.google.callback.tsx
import type { LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { exchangeGoogleCodeForToken } from "~/services/googleOAuth.server";
import db from "~/db.server";

function base64UrlDecode(input: string) {
  // Node supports "base64url" directly
  return Buffer.from(input, "base64url").toString("utf8");
}

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);

  const stateRaw = url.searchParams.get("state");
  const code = url.searchParams.get("code");

  const redirectUri = process.env.GOOGLE_ADS_REDIRECT_URI;
  if (!redirectUri) {
    return redirect(
      `/app/integrations/google?googleError=${encodeURIComponent(
        "Missing GOOGLE_ADS_REDIRECT_URI"
      )}`
    );
  }

  if (!stateRaw || !code) {
    return redirect(
      `/app/integrations/google?googleError=${encodeURIComponent(
        "Missing state or code"
      )}`
    );
  }

  let state: any;
  try {
    // ✅ your /api/google/oauth/start base64url-encodes JSON state
    const decoded = base64UrlDecode(stateRaw);
    state = JSON.parse(decoded);
  } catch {
    return redirect(
      `/app/integrations/google?googleError=${encodeURIComponent("Invalid state")}`
    );
  }

  const shop = state?.shop;
  const returnTo = state?.returnTo || "/app/integrations/google";

  if (!shop) {
    return redirect(
      `/app/integrations/google?googleError=${encodeURIComponent(
        "Missing shop in state"
      )}`
    );
  }

  try {
    const token = await exchangeGoogleCodeForToken({ code, redirectUri });

    const expiresAt = new Date(Date.now() + (token.expires_in ?? 3600) * 1000);

    await db.googleConnection.upsert({
      where: { shop },
      create: {
        shop,
        accessToken: token.access_token,
        refreshToken: token.refresh_token ?? null,
        expiresAt,
        adCustomerId: null,
      },
      update: {
        accessToken: token.access_token,
        refreshToken: token.refresh_token ?? undefined,
        expiresAt,
      },
    });

    return redirect(returnTo);
  } catch (e: any) {
    return redirect(
      `${returnTo}?googleError=${encodeURIComponent(e?.message ?? String(e))}`
    );
  }
}
