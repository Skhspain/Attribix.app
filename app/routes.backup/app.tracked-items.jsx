// app/routes/app.tracked-items.jsx
import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import db from "~/utils/db.server";
import { Page, Card, DataTable, Text } from "@shopify/polaris";

export const loader = async () => {
  const events = await db.event.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  const rows = events.map((e) => [
    new Date(e.createdAt).toLocaleString(),
    e.name,
    JSON.stringify(e.payload),
    e.source || "",
  ]);

  return json({ rows });
};

export default function TrackedItems() {
  const { rows } = useLoaderData();
  return (
    <Page title="Tracked Events">
      <Card>
        <DataTable
          columnContentTypes={["text", "text", "text", "text"]}
          headings={["Time", "Event", "Payload", "Source"]}
          rows={rows}
          stickyHeader
        />
        {rows.length === 0 && (
          <div className="p-4">
            <Text as="p" variant="bodyMd">No events yet. Trigger one via `/api/track`.</Text>
          </div>
        )}
      </Card>
    </Page>
  );
}
