import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { authenticate } from "../shopify.server";
import shopify from "../shopify.server";

export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  const rest = new shopify.api.clients.Rest({ session: admin.session });

  async function count(path, key = "count") {
    try {
      const resp = await rest.get({ path });               // e.g. 'products/count.json'
      const body = resp?.data ?? resp?.body ?? {};
      const value = body?.[key] ?? body?.count ?? 0;
      return typeof value === "number" ? value : 0;
    } catch (err) {
      console.error(`REST ${path} failed`, err);
      return 0;
    }
  }

  const [productCount, orderCount, customerCount] = await Promise.all([
    count("products/count.json"),
    count("orders/count.json"),
    count("customers/count.json"),
  ]);

  return json({ productCount, orderCount, customerCount });
};

export default function AppPage() {
  const { productCount, orderCount, customerCount } = useLoaderData();

  return (
    <main style={{ padding: 24 }}>
      <h1>Attribix – Overview</h1>
      <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(3, 1fr)", maxWidth: 900 }}>
        <Card title="Products" value={productCount} />
        <Card title="Orders" value={orderCount} />
        <Card title="Customers" value={customerCount} />
      </div>
      <p style={{ marginTop: 24 }}>
        If these show 0, check app scopes and that the REST Admin API is enabled.
      </p>
    </main>
  );
}

function Card({ title, value }) {
  return (
    <div style={{ border: "1px solid #e5e5e5", borderRadius: 12, padding: 16 }}>
      <div style={{ color: "#666", marginBottom: 8 }}>{title}</div>
      <div style={{ fontSize: 32, fontWeight: 700 }}>{value}</div>
    </div>
  );
}

export function ErrorBoundary({ error }) {
  console.error(error);
  return (
    <main style={{ padding: 24 }}>
      <h1>App Error</h1>
      <pre style={{ whiteSpace: "pre-wrap", background: "#fee", padding: 12 }}>{String(error)}</pre>
    </main>
  );
}
