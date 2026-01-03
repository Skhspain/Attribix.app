// app/routes/auth.login/route.jsx
import { redirect, json } from "@remix-run/node";
import shopify from "~/shopify.server";

/**
 * Shopify embedded auth flow:
 * - Shopify should call /auth/login?shop=...&host=...
 * - If we ever get /auth/login without `shop`, Shopify auth can't proceed and you'll see `{}`.
 * This file adds a safe fallback by deriving `shop` from `host` (base64 "<shop>/admin").
 */

function shopFromHost(host) {
  try {
    const decoded = Buffer.from(host, "base64").toString("utf8"); // "<shop>/admin"
    const shop = decoded.split("/")[0];
    return shop && shop.includes(".myshopify.com") ? shop : null;
  } catch {
    return null;
  }
}

export async function loader({ request }) {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");
  const host = url.searchParams.get("host");

  // Fix missing shop param (prevents the `{}` blank page)
  if (!shop && host) {
    const derivedShop = shopFromHost(host);
    if (derivedShop) {
      url.searchParams.set("shop", derivedShop);
      return redirect(`/auth/login?${url.searchParams.toString()}`);
    }
  }

  // If we still don't have a shop, return something actionable (not `{}`)
  if (!shop) {
    return json(
      {
        ok: false,
        error: "Missing `shop` parameter for Shopify login.",
        hint: "Open the app from Shopify Admin (embedded) so the URL includes ?shop=...&host=...",
      },
      { status: 400 }
    );
  }

  return shopify.login(request);
}

export async function action({ request }) {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");
  const host = url.searchParams.get("host");

  if (!shop && host) {
    const derivedShop = shopFromHost(host);
    if (derivedShop) {
      url.searchParams.set("shop", derivedShop);
      return redirect(`/auth/login?${url.searchParams.toString()}`);
    }
  }

  if (!shop) {
    return json(
      {
        ok: false,
        error: "Missing `shop` parameter for Shopify login.",
      },
      { status: 400 }
    );
  }

  return shopify.login(request);
}
