// app/routes/app.stats.jsx
import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import prisma from "../db.server";
import { authenticate } from "../shopify.server";

// Import Polaris safely (CommonJS compatibility)
import Polaris from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";

const { Page, Card, Text, Stack, Heading } = Polaris;

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
    <Page fullWidth>
      <TitleBar title="Stats Overview" />
      <Layout>
        <Layout.Section>
          <Card title="Summary" sectioned>
            <Stack vertical spacing="tight">
              <Heading>Total Events</Heading>
              <Text variant="bodyMd">{count}</Text>

              <Heading>Total Value</Heading>
              <Text variant="bodyMd">${totalValue.toFixed(2)}</Text>
            </Stack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card title="Events by UTM Source" sectioned>
            <Stack vertical spacing="tight">
              {bySource.length === 0 && <Text>No UTM source data.</Text>}
              {bySource.map((source) => (
                <Stack alignment="center" key={source.utmSource}>
                  <Text variant="bodyMd" fontWeight="medium">
                    {source.utmSource || "Unknown"}:
                  </Text>
                  <Text variant="bodyMd">{source._count}</Text>
                </Stack>
              ))}
            </Stack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}