// app/routes/app.jsx
import { json } from "@remix-run/node";
import {
  useLoaderData,
  useRouteError,
  isRouteErrorResponse,
} from "@remix-run/react";
import { authenticate } from "~/shopify.server";

export async function loader({ request }) {
  const { admin, session, redirect } = await authenticate.admin(request);
  if (redirect) return redirect; // continue Shopify auth flow if needed

  try {
    // Shopify REST counts (requires read_products & read_orders scopes)
    const productsRes = await admin.rest.get({ path: "products/count" });
    const ordersRes = await admin.rest.get({ path: "orders/count" });

    const productsCount =
      productsRes?.body?.count ?? productsRes?.data?.count ?? 0;
    const ordersCount =
      ordersRes?.body?.count ?? ordersRes?.data?.count ?? 0;

    return json({
      shop: session.shop,
      productsCount,
      ordersCount,
    });
  } catch (err) {
    console.error("Loader /app failed:", err);
    const message =
      err?.message ?? (typeof err === "string" ? err : JSON.stringify(err));
    // Throw a Response so ErrorBoundary can show real info
    throw new Response(message || "App loader failed", { status: 500 });
  }
}

export default function AppRoute() {
  const data = useLoaderData(); // <-- no generic in .jsx
  return (
    <main style={{ padding: 24 }}>
      <h1>Attribix</h1>
      <p>Shop: {data.shop}</p>
      <p>Products: {data.productsCount}</p>
      <p>Orders: {data.ordersCount}</p>
    </main>
  );
}

export function ErrorBoundary() {
  const error = useRouteError();
  console.error("Remix ErrorBoundary (/app):", error);

  if (isRouteErrorResponse(error)) {
    return (
      <main style={{ padding: 24 }}>
        <h2>App Error</h2>
        <p>
          {error.status} {error.statusText}
        </p>
        <pre>
          {typeof error.data === "string"
            ? error.data
            : JSON.stringify(error.data)}
        </pre>
      </main>
    );
  }

  if (error instanceof Error) {
    return (
      <main style={{ padding: 24 }}>
        <h2>App Error</h2>
        <pre>{error.message}</pre>
      </main>
    );
  }

  return (
    <main style={{ padding: 24 }}>
      <h2>App Error</h2>
      <pre>Unknown error</pre>
    </main>
  );
}
