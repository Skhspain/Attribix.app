// app/routes/auth.login.tsx
import type { ActionFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";

/**
 * Receives POST from the plain <form> on "/" and immediately
 * redirects to /auth?shop=... so @shopify/app kicks off OAuth.
 */
export async function action({ request }: ActionFunctionArgs) {
  const form = await request.formData();
  let shop = (form.get("shop") ?? "").toString().trim();

  if (!shop) {
    return json({ error: "Missing shop" }, { status: 400 });
  }
  if (!shop.endsWith(".myshopify.com")) {
    shop = `${shop}.myshopify.com`;
  }

  // Hand over to the existing /auth route (your app already has it)
  return redirect(`/auth?shop=${encodeURIComponent(shop)}`);
}

// No UI for this route (POST only)
export default function AuthLogin() {
  return null;
}
