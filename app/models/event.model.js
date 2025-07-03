import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { Page, Card, Text } from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import db from "../db.server";

export const loader = async ({ request }) => {
  await authenticate.admin(request);

  const sampleItems = Array.from({ length: 5 }).map((_, i) => ({
    name: `Test Item ${i + 1}`,
  }));

  await db.trackedItem.createMany({ data: sampleItems });

  return json({ created: sampleItems.length });
};

export default function SeedTestData() {
  const { created } = useLoaderData();
  return (
    <Page>
      <TitleBar title="Seed Test Data" />
      <Card>
        <Text as="p">Created {created} test tracked items.</Text>
      </Card>
    </Page>
  );
}