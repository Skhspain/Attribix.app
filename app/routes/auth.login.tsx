import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { Form, useActionData } from "@remix-run/react";

function normalizeShop(input: string): string | null {
  let shop = (input || "").trim().toLowerCase();
  if (!shop) return null;
  if (!shop.endsWith(".myshopify.com")) {
    shop = `${shop.replace(/\.myshopify\.com$/, "")}.myshopify.com`;
  }
  if (!/^[a-z0-9-]+\.myshopify\.com$/.test(shop)) return null;
  return shop;
}

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const shop = normalizeShop(url.searchParams.get("shop") || "");
  if (shop) {
    return redirect(`/auth?shop=${encodeURIComponent(shop)}`);
  }
  return json({});
}

export async function action({ request }: ActionFunctionArgs) {
  const form = await request.formData();
  const shop = normalizeShop(String(form.get("shop") || ""));
  if (!shop) return json({ error: "Please enter a valid shop domain" }, { status: 400 });
  return redirect(`/auth?shop=${encodeURIComponent(shop)}`);
}

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
          <input name="shop" placeholder="attribix-com.myshopify.com" style={{ flex: 1, padding: 8 }} />
          <button type="submit" style={{ padding: "8px 14px" }}>Continue</button>
        </div>
        {data?.error ? <p style={{ color: "crimson", marginTop: 8 }}>{data.error}</p> : null}
      </Form>
    </main>
  );
}
