// app/routes/seed-test-data.jsx
import { json } from "@remix-run/node";

/**
 * POST /seed-test-data
 * This route performs server-only work and returns JSON.
 * No top-level server imports; we load Prisma at runtime in the action.
 */
export const action = async () => {
  // ✅ Load server-only Prisma *inside* the server handler with a relative path + .js extension
  const { default: prisma } = await import("../utils/db.server.js");

  // --- seed your data here ---
  // Example scaffolding (remove/replace with your real seed):
  // await prisma.product.create({ data: { shop: "example.myshopify.com", handle: "demo", title: "Demo" } });

  return json({ ok: true });
};

// If you hit this route via GET, just 200 with a hint
export const loader = async () => {
  return json({ message: "POST to this route to seed data." });
};

// No UI needed; returning null keeps it UI-less
export default function SeedTestDataRoute() {
  return null;
}
