import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { Page, Card, Text } from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const loader = async ({ request }) => {
  await authenticate.admin(request);

  // Seed 3 events with 2 products each
  const createdEvents = await Promise.all(
    Array.from({ length: 3 }).map((_, i) =>
      prisma.trackedEvent.create({
        data: {
          eventName: "Purchase",
          utmSource: ["meta", "google", "tiktok"][i % 3],
          utmMedium: "cpc",
          utmCampaign: `test-campaign-${i + 1}`,
          shop: "attribix-com.myshopify.com",
          orderId: `order_${i + 100}`,
          value: 49.99 + i * 10,
          currency: "USD",
          email: `test${i}@example.com`,
          createdAt: new Date(),
          products: {
            create: [
              {
                productId: `prod_${i}a`,
                productName: `Test Product ${i + 1}A`,
                quantity: 1 + i,
              },
              {
                productId: `prod_${i}b`,
                productName: `Test Product ${i + 1}B`,
                quantity: 2 + i,
              },
            ],
          },
        },
      })
    )
  );

  return json({ created: createdEvents.length });
};

export default function SeedTestData() {
  const { created } = useLoaderData();
  return (
    <Page>
      <TitleBar title="Seed Test Data" />
      <Card>
        <Text as="p">Created {created} full purchase events with products.</Text>
      </Card>
    </Page>
  );
}