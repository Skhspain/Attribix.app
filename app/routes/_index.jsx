// app/routes/_index.jsx
import { json } from "@remix-run/node";

export async function loader() {
  return json({ ok: true });
}

export default function IndexRoute() {
  return (
    <main style={{ padding: 16 }}>
      <h1>Attribix App</h1>
      <p>Open the embedded app from Shopify Admin.</p>
    </main>
  );
}
