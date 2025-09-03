// app/routes/auth.login.tsx
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { Form, useActionData } from "@remix-run/react";

/** Normalize + validate a shop input into example.myshopify.com */
function normalizeShop(input: string): string | null {
  let shop = (input || "").trim().toLowerCase();
  if (!shop) return null;
  // Ensure *.myshopify.com
  if (!shop.endsWith(".myshopify.com")) {
    shop = `${shop.replace(/\.myshopify\.com$/, "")}.myshopify.com`;
  }
  // Basic allowlist
  if (!/^[a-z0-9-]+\.myshopify\.com$/.test(shop)) return null;
  return shop;
}

/** Handle GET /auth/login?shop=... — redirect straight into OAuth begin */
export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const shopParam = url.searchParams.get("shop");
  const shop = normalizeShop(shopParam || "");
  if (shop) {
    return redirect(`/auth?shop=${shop}`);
  }
  // No shop? render the form UI below
  return json({});
}

/** Handle POST from the form */
export async function action({ request }: ActionFunctionArgs) {
  const form = await request.formData();
  const shop = normalizeShop(String(form.get("shop") || ""));
  if (!shop) {
    return json({ error: "Please enter a valid shop domain" }, { status: 400 });
  }
  return redirect(`/auth?shop=${shop}`);
}

/** Minimal login form (used when GET has no ?shop=) */
export default function AuthLogin() {
  const data = useActionData<typeof action>();
  return (
    <main style={{ padding: 24, maxWidth: 520 }}>
      <h1 style={{ marginBottom: 12 }}>Log in to Attribix</h1>
      <p style={{ marginBottom: 16, opacity: 0.8 }}>
        Enter your Shopify shop domain to continue:
      </p>
      <Form method="post">
        <div style={{ display: "flex", gap: 8 }}>
          <input
            name="shop"
            placeholder="attribix-com.myshopify.com"
            defaultValue=""
            style={{ flex: 1, padding: 8 }}
          />
          <button type="submit" style={{ padding: "8px 14px" }}>
            Continue
          </button>
        </div>
        {data?.error ? (
          <p style={{ color: "crimson", marginTop: 8 }}>{data.error}</p>
        ) : null}
      </Form>
    </main>
  );
}
