import { json } from "@remix-run/node";

// Shopify sometimes prefetches route data; this prevents 400s.
export async function loader() {
  return json({ ok: true });
}

export default function Index() {
  return (
    <div style={{ padding: 16, maxWidth: 420 }}>
      <form method="post" action="/auth/login">
        <input
          name="shop"
          placeholder="your-store.myshopify.com"
          defaultValue="attribix-com.myshopify.com"
          style={{
            width: "100%",
            padding: 10,
            borderRadius: 6,
            border: "1px solid #e1e3e5",
          }}
        />
        <button
          type="submit"
          style={{
            marginTop: 10,
            padding: "10px 16px",
            borderRadius: 6,
            border: "1px solid #111827",
          }}
        >
          Log in
        </button>
      </form>

      {/* optional friendly message area */}
      <p style={{ color: "#dc2626", marginTop: 8 }}>
        {/* this stays empty unless /auth/login returns an error param */}
      </p>
    </div>
  );
}
