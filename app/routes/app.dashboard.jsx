import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";

/**
 * Route: /app/dashboard
 * NOTE: We do NOT import server-only modules at the top level.
 * We dynamically import Prisma inside the loader so Vite/Remix
 * won't try to bundle it into the client.
 */
export const loader = async () => {
  // Load Prisma only at request time (server-only)
  const { default: prisma } = await import("../utils/db.server.js"); // <- relative + .js

  // --- Example query (adjust/remove as needed) ---
  // If you don't need DB yet, you can leave this commented.
  // const totalProducts = await prisma.product.count().catch(() => 0);

  return json({
    ok: true,
    // totalProducts,
  });
};

export default function DashboardRoute() {
  const data = useLoaderData();
  return (
    <div style={{ padding: 24 }}>
      <h1>Dashboard</h1>
      <p>Server is happy. Prisma is loaded only on the server.</p>
      {/* <p>Total products: {data.totalProducts}</p> */}
    </div>
  );
}
