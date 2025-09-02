import { json } from "@remix-run/node";
import { useLoaderData, useSearchParams } from "@remix-run/react";
import * as React from "react";

// ❌ remove this (server-only at module scope):
// import db from "~/utils/db.server";

export async function loader({ request }) {
  // ✅ server-only import at runtime (works in dev/build, no client bundle)
  const { default: db } = await import("../utils/db.server.js");

  const url = new URL(request.url);
  const eventName = url.searchParams.get("event") || undefined;
  const utmSource = url.searchParams.get("utmSource") || undefined;
  const start = url.searchParams.get("start");
  const end = url.searchParams.get("end");

  const where =
    eventName || utmSource || start || end
      ? {
          ...(eventName && { eventName }),
          ...(utmSource && { utmSource }),
          ...(start || end
            ? {
                timestamp: {
                  ...(start ? { gte: new Date(start) } : {}),
                  ...(end ? { lte: new Date(end) } : {}),
                },
              }
            : {}),
        }
      : {};

  const events = await db.trackedEvent.findMany({
    where,
    orderBy: { timestamp: "desc" },
    take: 100,
  });

  return json({ events });
}

export default function Dashboard() {
  const { events } = useLoaderData();
  const [searchParams] = useSearchParams();

  return (
    <div style={{ padding: 24 }}>
      <h1>Dashboard</h1>

      <form method="get" style={{ marginBottom: "1rem", display: "grid", gap: 8, gridTemplateColumns: "repeat(5, minmax(0, 1fr))" }}>
        <input
          type="text"
          name="event"
          placeholder="Event name"
          defaultValue={searchParams.get("event") || ""}
        />
        <input
          type="text"
          name="utmSource"
          placeholder="UTM source"
          defaultValue={searchParams.get("utmSource") || ""}
        />
        <input type="date" name="start" defaultValue={searchParams.get("start") || ""} />
        <input type="date" name="end" defaultValue={searchParams.get("end") || ""} />
        <button type="submit">Filter</button>
      </form>

      <ul>
        {events.map((e) => (
          <li key={e.id}>
            <strong>{e.eventName}</strong> — {e.utmSource || "n/a"} —{" "}
            {new Date(e.timestamp).toLocaleString()}
          </li>
        ))}
      </ul>
    </div>
  );
}
