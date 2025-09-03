// app/routes/app.jsx
import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { shopify } from "../shopify.server";

/**
 * Server: authenticate the admin request and fetch a few bits
 * of data via the REST client under shopify.api.clients.
 */
export async function loader({ request }) {
  // Get a valid admin session
  const { session } = await shopify.auth.authenticate.admin(request);

  // ✅ Correct location of the REST client
  const rest = new shopify.api.clients.Rest({ session });

  // Fetch shop info and some quick counts in parallel
  const [shopRes, productsRes, customersRes, ordersRes] = await Promise.all([
    rest.get({ path: "shop" }),
    rest.get({ path: "products/count" }),
    rest.get({ path: "customers/count" }),
    rest.get({ path: "orders/count" }),
  ]);

  const shop = shopRes.body?.shop ?? null;

  return json({
    shop: shop
      ? {
          name: shop.name,
          myshopifyDomain: shop.myshopify_domain,
          email: shop.email,
          plan: shop.plan_display_name,
          currency: shop.currency,
          country: shop.country_name,
        }
      : null,
    counts: {
      products: productsRes.body?.count ?? 0,
      customers: customersRes.body?.count ?? 0,
      orders: ordersRes.body?.count ?? 0,
    },
  });
}

/**
 * Client: render a simple dashboard. Keep it minimal to avoid
 * Polaris/import churn while we’re stabilizing.
 */
export default function AppDashboard() {
  const { shop, counts } = useLoaderData();

  return (
    <div style={{ padding: 16, fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif" }}>
      <h1 style={{ marginBottom: 8 }}>Attribix</h1>

      {shop ? (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 12,
            marginBottom: 16,
          }}
        >
          <Card title="Shop">
            <div><strong>{shop.name}</strong></div>
            <div>{shop.myshopifyDomain}</div>
            <div>{shop.country}</div>
            <div>Plan: {shop.plan}</div>
            <div>Email: {shop.email}</div>
            <div>Currency: {shop.currency}</div>
          </Card>

          <Card title="Products">
            <BigNumber value={counts.products} />
          </Card>

          <Card title="Customers">
            <BigNumber value={counts.customers} />
          </Card>

          <Card title="Orders">
            <BigNumber value={counts.orders} />
          </Card>
        </div>
      ) : (
        <div style={{ color: "#b00" }}>Couldn’t load shop info.</div>
      )}
    </div>
  );
}

function Card({ title, children }) {
  return (
    <div style={{ border: "1px solid #eee", borderRadius: 12, padding: 14, background: "#fff" }}>
      <div style={{ fontSize: 14, fontWeight: 600, opacity: 0.8, marginBottom: 8 }}>{title}</div>
      {children}
    </div>
  );
}

function BigNumber({ value }) {
  return <div style={{ fontSize: 32, fontWeight: 700 }}>{value}</div>;
}
