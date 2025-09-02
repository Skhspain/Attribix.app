import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";

/**
 * NOTE:
 * - No top-level imports of server-only modules.
 * - We dynamically import the Prisma client inside the loader.
 */
export async function loader() {
  const { db } = await import("../utils/db.server"); // server-only import

  // Try to read products; fall back safely if your model is named differently
  let products = [];
  try {
    // Adjust to your schema (e.g. db.product / db.products / db.item, etc.)
    products = (await (db.product?.findMany?.() ?? Promise.resolve([]))) || [];
  } catch {
    products = [];
  }

  return json({ products });
}

export default function ReportsProducts() {
  const data = useLoaderData(); // { products }
  return (
    <div style={{ padding: 16 }}>
      <h1>Reports – Products</h1>
      <p>Total products: {data?.products?.length ?? 0}</p>
      {/* Render your existing UI here */}
    </div>
  );
}
