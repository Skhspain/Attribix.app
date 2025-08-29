import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { Page, Card, Text } from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import prisma from "~/utils/db.server";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {
  await authenticate.admin(request);

  const count = await prisma.trackedEvent.count();
  const totalValue = await prisma.trackedEvent.aggregate({
    _sum: { value: true },
  });

  const bySource = await prisma.trackedEvent.groupBy({
    by: ["utmSource"],
    _count: true,
  });

  return json({
    count,
    totalValue: totalValue._sum.value || 0,
    bySource,
  });
};

export default function StatsPage() {
  const { count, totalValue, bySource } = useLoaderData();

  return (
    <Page>
      <TitleBar title="Stats Overview" />
      <Card>
        <Text as="p">🛒 Total events: {count}</Text>
        <Text as="p">💰 Total value: ${totalValue.toFixed(2)}</Text>
        <Text as="p">📊 Events by UTM Source:</Text>
        {bySource.map((s) => (
          <Text key={s.utmSource} as="p">
            • {s.utmSource}: {s._count}
          </Text>
        ))}
      </Card>
    </Page>
  );
}
