// app/routes/_index.jsx
export default function Index() {
  return (
    <div style={{ padding: 16, fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif" }}>
      <h1>Attribix</h1>

      {/* Plain HTML form -> real POST -> server redirect (no fetcher) */}
      <form method="post" action="/auth/login" style={{ display: "flex", gap: 8 }}>
        <input
          type="text"
          name="shop"
          defaultValue="attribix-com.myshopify.com"
          placeholder="my-shop.myshopify.com"
          style={{ padding: 8, width: 280 }}
          required
        />
        <button type="submit" style={{ padding: "8px 14px" }}>Log in</button>
      </form>

      <p style={{ color: "#b00", marginTop: 8 }}>
        {/* This line will only show if you wire an ?err= param; safe to leave */}
      </p>
    </div>
  );
}
