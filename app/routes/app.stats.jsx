import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import * as React from "react";

/**
 * IMPORTANT:
 * - No server-only imports at module scope.
 * - We dynamically import ../utils/db.server.js inside the loader.
 */
export const loader = async () => {
  // Server-only dynamic import (note the relative path + .js)
  const { default: db } = await import("../utils/db.server.js");

  // Helper that safely calls .count() if the model exists in your schema
  async function safeCount(modelName) {
    const model = db?.[modelName];
    if (model?.count) {
      try {
        return await model.count();
      } catch {
        // ignore schema/permission errors and fall back to 0
      }
    }
    return 0;
  }

  const totals = {
    products: await safeCount("product"),
    orders: await safeCount("order"),
    customers: await safeCount("customer"),
    trackedItems: await safeCount("trackedItem"),
  };

  return json({ totals });
};

export default function AppStats() {
  const { totals } = useLoaderData();

  return (
    <div style={{ padding: 24 }}>
      <h1>Stats</h1>
      <ul>
        <li>Products: {totals.products}</li>
        <li>Orders: {totals.orders}</li>
        <li>Customers: {totals.customers}</li>
        <li>Tracked Items: {totals.trackedItems}</li>
      </ul>
    </div>
  );
}
