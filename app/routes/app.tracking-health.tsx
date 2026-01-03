import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import prisma from "~/db.server";
import { Page, Card, Text, BlockStack, InlineStack, Badge } from "@shopify/polaris";

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");

  const where = shop ? { shop } : {};

  const lastEvent = await prisma.pixelEvent.findFirst({
    where,
    orderBy: { createdAt: "desc" },
    select: { createdAt: true, event: true, url: true, shop: true },
  });

  const total = await prisma.pixelEvent.count({ where });
  const last24h = await prisma.pixelEvent.count({
    where: {
      ...where,
      createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
    },
  });

  return json({ shop: shop || null, total, last24h, lastEvent });
}

export default function TrackingHealth() {
  const data = useLoaderData<typeof loader>();

  return (
    <Page title="Tracking health">
      <BlockStack gap="400">
        <Card>
          <BlockStack gap="200">
            <Text as="h2" variant="headingMd">Overview</Text>
            <InlineStack gap="200" align="space-between">
              <Text as="p" variant="bodyMd">Shop</Text>
              <Badge>{data.shop ?? "All shops"}</Badge>
            </InlineStack>
            <InlineStack gap="200" align="space-between">
              <Text as="p" variant="bodyMd">Total events</Text>
              <Text as="p" variant="bodyMd">{data.total}</Text>
            </InlineStack>
            <InlineStack gap="200" align="space-between">
              <Text as="p" variant="bodyMd">Last 24h</Text>
              <Text as="p" variant="bodyMd">{data.last24h}</Text>
            </InlineStack>
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="200">
            <Text as="h2" variant="headingMd">Last event</Text>
            {data.lastEvent ? (
              <>
                <InlineStack gap="200" align="space-between">
                  <Text as="p" variant="bodyMd">Event</Text>
                  <Badge>{data.lastEvent.event}</Badge>
                </InlineStack>
                <InlineStack gap="200" align="space-between">
                  <Text as="p" variant="bodyMd">Time</Text>
                  <Text as="p" variant="bodyMd">{new Date(data.lastEvent.createdAt).toLocaleString()}</Text>
                </InlineStack>
                <Text as="p" variant="bodySm" tone="subdued">
                  {data.lastEvent.url ?? ""}
                </Text>
              </>
            ) : (
              <Text as="p" variant="bodyMd" tone="subdued">
                No events received yet.
              </Text>
            )}
          </BlockStack>
        </Card>
      </BlockStack>
    </Page>
  );
}
