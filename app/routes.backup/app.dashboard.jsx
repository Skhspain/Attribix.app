import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { Card, Page } from "@shopify/polaris";
import prisma from "../db.server";

export const loader = async () => {
  const events = await prisma.trackedEvent.findMany({
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  return json({ events });
};

export default function Dashboard() {
  const { events } = useLoaderData();
  return (
    <Page title="Tracked Events">
      <Card sectioned>
        <ul>
          {events.map((e) => (
            <li key={e.id}>{e.eventName} - {new Date(e.createdAt).toLocaleString()}</li>
          ))}
        </ul>
      </Card>
    </Page>
  );
}