import { json, type LoaderFunctionArgs } from "@remix-run/node";

export async function loader({ request }: LoaderFunctionArgs) {
  // server-only import (NodeNext-friendly: note the .js suffix)
  const { db } = await import("../utils/db.server.js");

  const dbAny = db as any;

  let items: unknown[] = [];
  try {
    items =
      (await dbAny.trackedItem?.findMany?.({
        include: { products: true }, // adjust to your schema if needed
      })) ?? [];
  } catch {
    items = [];
  }

  return json({ items });
}
