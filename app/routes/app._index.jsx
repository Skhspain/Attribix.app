// app/routes/app._index.jsx
import { json } from "@remix-run/node";
import { useLoaderData, Link } from "@remix-run/react";
import shopify from "~/shopify.server";

export async function loader({ request }) {
  // Auth guard + Admin client (works across old/new helpers)
  const anyShopify = shopify;
  let admin;
  if (anyShopify.authenticate?.admin) {
    const { admin: adminClient } = await anyShopify.authenticate.admin(request);
    admin = adminClient;
  } else if (typeof anyShopify.ensureInstalledOnShop === "function") {
    // Not usually needed if you’re already inside /app, but leaving as safety.
    const { admin: adminClient } = await anyShopify.authenticate.admin(request);
    admin = adminClient;
  } else {
    throw new Response("No Shopify admin client available", { status: 500 });
  }

  // Use GraphQL to fetch counts
  const query = `
    {
      products(first: 1) { edges { node { id } } }
      orders(first: 1) { edges { node { id } } }
    }
  `;

  let productsCount = null;
  let ordersCount = null;
  const warnings = [];

  try {
    const res = await admin.graphql(query);
    const data = await res.json();

    // These aren’t true counts (GraphQL has no count field without an extra query),
    // but this proves the scope is working. For real counts you can either:
    // 1) Use REST /admin/api/2024-07/products/count.json and /orders/count.json
    // 2) Use a GraphQL aggregate or paginate and count (heavier)
    const prodOk = Array.isArray(data?.data?.products?.edges);
    const ordOk = Array.isArray(data?.data?.orders?.edges);

    productsCount = prodOk ? data.data.products.edges.length : null;
    ordersCount = ordOk ? data.data.orders.edges.length : null;

    if (!prodOk) warnings.push("Products query returned no data — missing scope?");
    if (!ordOk) warnings.push("Orders query returned no data — missing scope?");
  } catch (err) {
    warnings.push(`GraphQL error: ${String(err)}`);
  }

  return json({ productsCount, ordersCount, warnings });
}

export default function AppIndex() {
  const { productsCount, ordersCount, warnings } = useLoaderData();

  return (
    <div style={{ padding: 16 }}>
      <h1>Attribix</h1>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div style={{ border: "1px solid #eee", borderRadius: 12, padding: 16 }}>
          <h3>Products</h3>
          <div style={{ fontSize: 24 }}>{productsCount ?? "—"}</div>
        </div>
        <div style={{ border: "1px solid #eee", borderRadius: 12, padding: 16 }}>
          <h3>Orders</h3>
          <div style={{ fontSize: 24 }}>{ordersCount ?? "—"}</div>
        </div>
      </div>

      <pre style={{ marginTop: 16 }}>
{JSON.stringify({ productsCount, ordersCount, warnings }, null, 2)}
      </pre>

      <p style={{ marginTop: 16 }}>
        <Link to="/app">Go to root</Link>
      </p>
    </div>
  );
}