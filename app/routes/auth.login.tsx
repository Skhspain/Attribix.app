import type { ActionFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { Form, useActionData } from "@remix-run/react";

export async function action({ request }: ActionFunctionArgs) {
  const form = await request.formData();
  let shop = (form.get("shop") ?? "").toString().trim();

  if (!shop) {
    return json({ error: "Please enter your shop domain" }, { status: 400 });
  }
  // Allow entering either "mystore" or "mystore.myshopify.com"
  if (!shop.includes(".")) shop = `${shop}.myshopify.com`;

  return redirect(`/auth?shop=${encodeURIComponent(shop)}`);
}

export default function Login() {
  const data = useActionData<typeof action>();
  return (
    <div style={{ padding: 24 }}>
      <h1>Log in to Attribix</h1>
      <Form method="post" style={{ display: "flex", gap: 8 }}>
        <input
          type="text"
          name="shop"
          placeholder="your-store.myshopify.com"
          style={{ padding: 8, minWidth: 320 }}
          aria-label="Shop domain"
        />
        <button type="submit">Log in</button>
      </Form>
      {data?.error ? (
        <p style={{ color: "crimson", marginTop: 8 }}>{data.error}</p>
      ) : null}
    </div>
  );
}
