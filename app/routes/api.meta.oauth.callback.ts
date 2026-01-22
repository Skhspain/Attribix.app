// app/routes/api.meta.oauth.callback.ts
import type { LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import db from "~/db.server";
import {
  exchangeCodeForShortLivedToken,
  exchangeForLongLivedToken,
  fetchAdAccounts,
} from "~/services/metaGraph.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  if (!code || !state) {
    return redirect("/app/ads?meta=error_missing_code");
  }

  // Find which shop started this OAuth by matching the stored state
  const conn = await (db as any).metaConnection.findFirst({
    where: { tokenType: state },
  });

  if (!conn) {
    return redirect("/app/ads?meta=error_bad_state");
  }

  // Exchange code -> short token -> long token
  const shortRes = await exchangeCodeForShortLivedToken(code);
  const longRes = await exchangeForLongLivedToken(shortRes.access_token);

  const accessToken = longRes.access_token;
  const expiresIn = Number(longRes.expires_in || 0);
  const expiresAt = expiresIn ? new Date(Date.now() + expiresIn * 1000) : null;

  // Fetch ad accounts so we can auto-pick first (you can add a selector later)
  const accountsRes = await fetchAdAccounts(accessToken);
  const first = accountsRes?.data?.[0];
  const adAccountId = first?.id || null; // usually "act_..."

  await (db as any).metaConnection.update({
    where: { shop: conn.shop },
    data: {
      accessToken,
      tokenType: "bearer",
      expiresAt,
      adAccountId,
    },
  });

  return redirect("/app/ads?meta=connected");
}
