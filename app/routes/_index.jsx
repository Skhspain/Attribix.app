import { json } from "@remix-run/node";
import { Form, useActionData, useNavigation } from "@remix-run/react";

export const loader = () => json({ ok: true });

export const action = async ({ request }) => {
  const fd = await request.formData();
  const shop = (fd.get("shop") || "").trim();
  if (!shop) return json({ error: "Enter your .myshopify.com domain" }, { status: 400 });

  return new Response(null, {
    status: 302,
    headers: { Location: `/auth/login?shop=${encodeURIComponent(shop)}` },
  });
};

export default function Index() {
  const data = useActionData();
  const nav = useNavigation();
  const busy = nav.state !== "idle";

  return (
    <main style={{ padding: 24 }}>
      <h1>Attribix</h1>
      <p>Enter your shop domain to log in:</p>
      <Form method="post" replace>
        <input
          name="shop"
          defaultValue="attribix-com.myshopify.com"
          placeholder="your-shop.myshopify.com"
          style={{ padding: 8, width: 320 }}
        />
        <button type="submit" disabled={busy} style={{ marginLeft: 8, padding: "8px 14px" }}>
          {busy ? "Starting…" : "Log in"}
        </button>
      </Form>
      {data?.error ? <p style={{ color: "crimson" }}>{data.error}</p> : null}
    </main>
  );
}
