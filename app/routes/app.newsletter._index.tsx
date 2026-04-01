// app/routes/app.newsletter._index.tsx
// Newsletter overview — KPI cards + quick links.
// NEW FILE.

import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { authenticate } from "~/shopify.server";
import db from "~/db.server";
import {
  Grid,
  Card,
  Text,
  BlockStack,
  InlineStack,
  Button,
  Divider,
  Badge,
  Box,
} from "@shopify/polaris";

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const anyDb = db as any;

  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [
    totalSubscribers,
    newSubscribers30d,
    unsubscribed30d,
    recentCampaigns,
  ] = await Promise.all([
    db.newsletterSubscriber.count({ where: { shop, status: "subscribed" } }),
    db.newsletterSubscriber.count({ where: { shop, status: "subscribed", createdAt: { gte: thirtyDaysAgo } } }),
    db.newsletterSubscriber.count({ where: { shop, status: "unsubscribed", unsubscribedAt: { gte: thirtyDaysAgo } } }),
    anyDb.newsletterCampaign?.findMany?.({
      where: { shop },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { id: true, name: true, status: true, sentAt: true, recipientCount: true, openCount: true, clickCount: true },
    }).catch(() => []) ?? [],
  ]);

  // Source breakdown
  const sources = await db.newsletterSubscriber.groupBy({
    by: ["source"],
    where: { shop, status: "subscribed" },
    _count: { source: true },
    orderBy: { _count: { source: "desc" } },
  });

  return json({
    totalSubscribers,
    newSubscribers30d,
    unsubscribed30d,
    recentCampaigns,
    sources,
  });
}

export default function NewsletterOverview() {
  const { totalSubscribers, newSubscribers30d, unsubscribed30d, recentCampaigns, sources } =
    useLoaderData<typeof loader>();

  const statusBadge = (status: string) => {
    const map: Record<string, "success" | "info" | "warning" | "critical" | "new"> = {
      sent: "success",
      sending: "info",
      scheduled: "warning",
      draft: "new",
      failed: "critical",
    };
    return <Badge tone={map[status] ?? "new"}>{status}</Badge>;
  };

  return (
    <BlockStack gap="500">
      {/* KPI cards */}
      <Grid>
        <Grid.Cell columnSpan={{ xs: 6, sm: 4, md: 4, lg: 4, xl: 4 }}>
          <Card>
            <BlockStack gap="100">
              <Text as="p" variant="bodySm" tone="subdued">Total subscribers</Text>
              <Text as="p" variant="headingXl">{totalSubscribers.toLocaleString()}</Text>
            </BlockStack>
          </Card>
        </Grid.Cell>
        <Grid.Cell columnSpan={{ xs: 6, sm: 4, md: 4, lg: 4, xl: 4 }}>
          <Card>
            <BlockStack gap="100">
              <Text as="p" variant="bodySm" tone="subdued">New last 30 days</Text>
              <Text as="p" variant="headingXl" tone="success">+{newSubscribers30d.toLocaleString()}</Text>
            </BlockStack>
          </Card>
        </Grid.Cell>
        <Grid.Cell columnSpan={{ xs: 6, sm: 4, md: 4, lg: 4, xl: 4 }}>
          <Card>
            <BlockStack gap="100">
              <Text as="p" variant="bodySm" tone="subdued">Unsubscribed last 30 days</Text>
              <Text as="p" variant="headingXl" tone="critical">-{unsubscribed30d.toLocaleString()}</Text>
            </BlockStack>
          </Card>
        </Grid.Cell>
      </Grid>

      {/* Recent campaigns + source breakdown side by side */}
      <Grid>
        <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 8, lg: 8, xl: 8 }}>
          <Card>
            <BlockStack gap="400">
              <InlineStack align="space-between">
                <Text as="h2" variant="headingSm">Recent campaigns</Text>
                <Button variant="plain" url="/app/newsletter/campaigns">View all</Button>
              </InlineStack>
              {recentCampaigns.length === 0 ? (
                <Text as="p" tone="subdued">No campaigns yet. <Button variant="plain" url="/app/newsletter/campaigns/new">Create your first one →</Button></Text>
              ) : (
                <BlockStack gap="300">
                  {recentCampaigns.map((c: any) => (
                    <div key={c.id}>
                      <InlineStack align="space-between" blockAlign="center">
                        <BlockStack gap="050">
                          <Text as="p" variant="bodyMd" fontWeight="semibold">{c.name}</Text>
                          <Text as="p" variant="bodySm" tone="subdued">
                            {c.sentAt
                              ? `Sent ${new Date(c.sentAt).toLocaleDateString()} · ${c.recipientCount} recipients`
                              : "Draft"}
                          </Text>
                        </BlockStack>
                        <InlineStack gap="200" blockAlign="center">
                          {statusBadge(c.status)}
                          <Button variant="plain" url={`/app/newsletter/campaigns/${c.id}`}>Edit</Button>
                        </InlineStack>
                      </InlineStack>
                      <Divider />
                    </div>
                  ))}
                </BlockStack>
              )}
            </BlockStack>
          </Card>
        </Grid.Cell>

        <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 4, lg: 4, xl: 4 }}>
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingSm">Subscriber sources</Text>
              {sources.length === 0 ? (
                <Text as="p" tone="subdued">No subscribers yet.</Text>
              ) : (
                <BlockStack gap="200">
                  {sources.map((s: any) => (
                    <InlineStack key={s.source ?? "unknown"} align="space-between">
                      <Text as="p" variant="bodySm">{s.source ?? "Unknown"}</Text>
                      <Text as="p" variant="bodySm" fontWeight="semibold">{s._count.source}</Text>
                    </InlineStack>
                  ))}
                </BlockStack>
              )}
            </BlockStack>
          </Card>
        </Grid.Cell>
      </Grid>

      {/* Setup instructions if no subscribers */}
      {totalSubscribers === 0 && (
        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingSm">Getting started</Text>
            <Text as="p" variant="bodySm" tone="subdued">
              Add the subscribe snippet to your storefront to start collecting emails. Use the endpoint below from your theme or a Shopify pixel:
            </Text>
            <Box background="bg-surface-secondary" borderRadius="200" padding="300">
              <Text as="p" variant="bodySm">
                <code>POST /api/newsletter/subscribe</code> with <code>{"{ shop, email, source, utm_source, utm_campaign }"}</code>
              </Text>
            </Box>
          </BlockStack>
        </Card>
      )}
    </BlockStack>
  );
}
