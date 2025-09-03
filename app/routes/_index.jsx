import { useRef, useState } from "react";

export const meta = () => [{ title: "Attribix – Log in" }];

export default function Index() {
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function handleLogin(e) {
    e.preventDefault();
    setError("");
    const shop = inputRef.current?.value?.trim();
    if (!shop) {
      setError("Enter your myshopify.com domain, e.g. attribix-com.myshopify.com");
      return;
    }
    try {
      setBusy(true);
      // Call the server route that starts OAuth
      const res = await fetch("/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ shop }).toString(),
      });

      // Shopify’s template puts the OAuth URL in this header
      const redirectTo = res.headers.get("X-Redirect");

      // Always navigate, even if the header wasn’t set for some reason
      window.location.assign(redirectTo || `/auth?shop=${encodeURIComponent(shop)}`);
    } catch (err) {
      setError("Couldn’t start Shopify login. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main style={{ padding: 24, fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial" }}>
      <h1 style={{ marginBottom: 16 }}>Attribix</h1>
      <form onSubmit={handleLogin} style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <input
          ref={inputRef}
          name="shop"
          placeholder="your-store.myshopify.com"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          style={{ padding: 8, minWidth: 320 }}
        />
        <button type="submit" disabled={busy} style={{ padding: "8px 14px" }}>
          {busy ? "Starting…" : "Log in"}
        </button>
      </form>
      {error ? <p style={{ color: "crimson", marginTop: 8 }}>{error}</p> : null}

      <noscript>
        <p style={{ marginTop: 12 }}>
          JavaScript is required. Alternatively, go to
          {" "}
          <strong>/auth?shop=your-store.myshopify.com</strong>
          {" "}
          (replace with your shop domain).
        </p>
      </noscript>
    </main>
  );
}
