import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { shopify } from "../shopify.server"; // NOTE: relative path (no "~")

export async function loader({ request }) {
  const { session } = await shopify.authenticate.admin(request);
  const rest = new shopify.api.clients.Rest({ session });

  // Helper so a failed call never crashes the page
  async function tryGet(path, query) {
    try {
      const res = await rest.get({ path, query });
      return res?.body ?? null;
    } catch (err) {
      console.error(`[app.jsx] REST ${path} failed`, err);
      return null;
    }
  }

  const [shopRes, customersCountRes, ordersCountRes, productsCountRes] =
    await Promise.all([
      tryGet("shop"),              // -> { shop: {...} }
      tryGet("customers/count"),   // -> { count: number }
      tryGet("orders/count"),      // -> { count: number }
      tryGet("products/count"),    // -> { count: number }
    ]);

  const shop = shopRes?.shop ?? null;
  const counts = {
    customers:
      typeof customersCountRes?.count === "number"
        ? customersCountRes.count
        : null,
    orders:
      typeof ordersCountRes?.count === "number" ? ordersCountRes.count : null,
    products:
      typeof productsCountRes?.count === "number" ? productsCountRes.count : null,
  };

  return json({ shop, counts });
}

export default function AppRoute() {
  const { shop, counts } = useLoaderData();

  return (
    <div style={{ padding: 16 }}>
      <h1 style={{ marginBottom: 8 }}>{shop?.name ?? "Your shop"}</h1>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: 12,
        }}
      >
        <StatCard title="Products" value={counts.products} />
        <StatCard title="Orders" value={counts.orders} />
        <StatCard title="Customers" value={counts.customers} />
      </div>
    </div>
  );
}

function StatCard({ title, value }) {
  return (
    <div
      style={{ border: "1px solid #e1e3e5", borderRadius: 8, padding: 12 }}
    >
      <div style={{ fontSize: 12, color: "#6b7280" }}>{title}</div>
      <div style={{ fontSize: 24, fontWeight: 600 }}>{value ?? "—"}</div>
    </div>
  );
}
