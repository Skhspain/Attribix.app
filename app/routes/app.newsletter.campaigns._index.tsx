// app/routes/app.newsletter.campaigns._index.tsx
// Campaign list — shows all campaigns with status + stats.
// NEW FILE.

import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { authenticate } from "~/shopify.server";
import db from "~/db.server";
import {
  Card,
  DataTable,
  Text,
  BlockStack,
  InlineStack,
  Button,
  Badge,
  EmptyState,
} from "@shopify/polaris";

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const anyDb = db as any;

  const campaigns = await anyDb.newsletterCampaign?.findMany?.({
    where: { shop },
    orderBy: { createdAt: "desc" },
    take: 100,
  }).catch(() => []) ?? [];

  return json({ campaigns });
}

export default function CampaignList() {
  const { campaigns } = useLoaderData<typeof loader>();

  if (campaigns.length === 0) {
    return (
      <Card>
        <EmptyState
          heading="No campaigns yet"
          action={{ content: "Create campaign", url: "/app/newsletter/campaigns/new" }}
          image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
        >
          <p>Create and send beautiful email campaigns to your subscribers.</p>
        </EmptyState>
      </Card>
    );
  }

  const statusBadge = (status: string) => {
    const toneMap: Record<string, "success" | "info" | "warning" | "critical" | "new"> = {
      sent: "success",
      sending: "info",
      scheduled: "warning",
      draft: "new",
      failed: "critical",
    };
    return <Badge tone={toneMap[status] ?? "new"}>{status}</Badge>;
  };

  const rows = campaigns.map((c: any) => [
    <Button variant="plain" url={`/app/newsletter/campaigns/${c.id}`}>{c.name}</Button>,
    c.subject,
    statusBadge(c.status),
    c.sentAt ? new Date(c.sentAt).toLocaleDateString() : "—",
    c.recipientCount ? c.recipientCount.toLocaleString() : "—",
    c.openCount
      ? `${Math.round((c.openCount / Math.max(c.recipientCount, 1)) * 100)}%`
      : "—",
    c.clickCount
      ? `${Math.round((c.clickCount / Math.max(c.recipientCount, 1)) * 100)}%`
      : "—",
  ]);

  return (
    <Card>
      <BlockStack gap="400">
        <InlineStack align="space-between">
          <Text as="h2" variant="headingSm">{campaigns.length} campaigns</Text>
          <Button variant="primary" url="/app/newsletter/campaigns/new">New campaign</Button>
        </InlineStack>
        <DataTable
          columnContentTypes={["text","text","text","text","numeric","text","text"]}
          headings={["Name","Subject","Status","Sent date","Recipients","Open rate","Click rate"]}
          rows={rows}
        />
      </BlockStack>
    </Card>
  );
}
