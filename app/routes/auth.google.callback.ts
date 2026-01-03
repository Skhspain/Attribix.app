// app/routes/auth.google.callback.ts
import { redirect, json } from "@remix-run/node";
import {
  exchangeCodeForTokens,
  verifyAndParseState,
} from "../utils/googleAuth.server";

export async function loader({ request }: { request: Request }) {
  const url = new URL(request.url);

  const error = url.searchParams.get("error");
  if (error) {
    // Google canceled/blocked/etc.
    return json(
      { ok: false, error, error_description: url.searchParams.get("error_description") },
      { status: 400 }
    );
  }

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) {
    return json({ ok: false, error: "Missing code/state" }, { status: 400 });
  }

  const parsed = verifyAndParseState(state);
  const tokens = await exchangeCodeForTokens(code);

  // ✅ For now: just redirect back and confirm we got tokens (without exposing them)
  // Later we’ll store tokens in DB per shop.
  const dest = new URL(parsed.returnTo || "/app", url.origin);
  if (parsed.shop) dest.searchParams.set("shop", parsed.shop);
  dest.searchParams.set("google", "connected");
  dest.searchParams.set("hasRefresh", tokens.refresh_token ? "1" : "0");

  return redirect(dest.toString());
}
