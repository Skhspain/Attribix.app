// app/routes/app.jsx
import * as React from "react";
import { json } from "@remix-run/node";
import {
  useLoaderData,
  useRouteError,
  isRouteErrorResponse,
  Link,
} from "@remix-run/react";
import { authenticate } from "../shopify.server";

/**
 * Auth + safe data fetches.
 * Any missing scope (e.g., read_orders) turns into a warning instead of crashing.
 */
export async function loader({ request }) {
  const { admin, redirect } = await authenticate.admin(request);
  if (redirect) return redirect;

  async function safeCount(path, label) {
    try {
      const res = await admin.rest.get({ path }); // e.g. "products/count.json"
      const body = res?.body ?? res?.data ?? {};
      const count =
        typeof body?.count === "number"
          ? body.count
          : Number.isFinite(body?.count)
          ? Number(body.count)
          : null;
      return { count, error: null };
    } catch (err) {
      const msg =
        (err && (err.message || String(err))) || "Unknown error fetching data";
      return { count: null, error: `Cannot read ${label}: ${msg}` };
    }
  }

  const [products, orders] = await Promise.all([
    safeCount("products/count.json", "products (requires read_products)"),
    safeCount("orders/count.json", "orders (may require read_orders)"),
  ]);

  const warnings = [products.error, orders.error].filter(Boolean);

  return json({
    productsCount: products.count,
    ordersCount: orders.count,
    warnings,
  });
}

export default function AppRoute() {
  const { productsCount, ordersCount, warnings } = useLoaderData();

  return (
    <main
      style={{
        padding: 24,
        fontFamily:
          'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
      }}
    >
      <header style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, margin: 0 }}>Attribix</h1>
        <p style={{ color: "#6b7280", marginTop: 6 }}>
          Embedded app is up. Counts below will show if the scope is available.
        </p>
      </header>

      <section
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 16,
        }}
      >
        <Card title="Products" value={productsCount} />
        <Card title="Orders" value={ordersCount} />
      </section>

      {warnings?.length > 0 && (
        <section style={{ marginTop: 24 }}>
          <div
            style={{
              background: "#FEF3C7",
              border: "1px solid #F59E0B",
              color: "#92400E",
              padding: 12,
              borderRadius: 12,
            }}
          >
            <strong>Heads up:</strong>
            <ul style={{ margin: "8px 0 0 18px" }}>
              {warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          </div>
        </section>
      )}

      <footer style={{ marginTop: 28 }}>
        <Link to="/">Go to root</Link>
      </footer>
    </main>
  );
}

function Card({ title, value }) {
  return (
    <div
      style={{
        border: "1px solid #e5e7eb",
        borderRadius: 12,
        padding: 16,
        minHeight: 96,
      }}
    >
      <div
        style={{
          fontSize: 12,
          textTransform: "uppercase",
          color: "#6b7280",
          letterSpacing: 0.5,
        }}
      >
        {title}
      </div>
      <div style={{ fontSize: 32, marginTop: 8 }}>{value ?? "—"}</div>
    </div>
  );
}

/** Robust error boundary so you never see “undefined” again */
export function ErrorBoundary() {
  const error = useRouteError();

  if (isRouteErrorResponse(error)) {
    return (
      <ErrorUI
        title={`Error ${error.status}`}
        message={error.data?.message || error.statusText || "Request failed"}
      />
    );
  }

  const message =
    (error && (error.message || String(error))) || "Unknown error";
  return <ErrorUI title="App Error" message={message} />;
}

function ErrorUI({ title, message }) {
  return (
    <main
      style={{
        padding: 24,
        fontFamily:
          'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
      }}
    >
      <h1 style={{ fontSize: 24, marginTop: 0 }}>{title}</h1>
      <div
        style={{
          background: "#FEE2E2",
          border: "1px solid #EF4444",
          color: "#991B1B",
          padding: 12,
          borderRadius: 12,
        }}
      >
        {String(message)}
      </div>
      <p style={{ marginTop: 16 }}>
        <Link to="/app">Back to /app</Link>
      </p>
    </main>
  );
}
