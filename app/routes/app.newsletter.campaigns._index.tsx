// app/routes/app.newsletter.campaigns._index.tsx
// Campaign list — shows all campaigns with status, stats, revenue + delete.

import { json, type LoaderFunctionArgs, type ActionFunctionArgs } from "@remix-run/node";
import { useLoaderData, useSubmit } from "@remix-run/react";
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

export async function action({ request }: ActionFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const anyDb = db as any;
  const form = await request.formData();
  const intent = form.get("intent");
  const id = form.get("id") as string;

  if (intent === "delete" && id) {
    const campaign = await anyDb.newsletterCampaign.findUnique({ where: { id } });
    if (campaign && campaign.shop === shop) {
      await anyDb.newsletterCampaign.delete({ where: { id } });
    }
  }

  return json({ ok: true });
}

export default function CampaignList() {
  const { campaigns } = useLoaderData<typeof loader>();
  const submit = useSubmit();

  function deleteCampaign(id: string, name: string) {
    if (!confirm(`Delete newsletter "${name}"? This cannot be undone.`)) return;
    const formData = new FormData();
    formData.append("intent", "delete");
    formData.append("id", id);
    submit(formData, { method: "post" });
  }

  if (campaigns.length === 0) {
    return (
      <Card>
        <EmptyState
          heading="No newsletters yet"
          action={{ content: "New newsletter", url: "/app/newsletter/campaigns/new" }}
          image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
        >
          <p>Create and send beautiful newsletters to your subscribers.</p>
        </EmptyState>
      </Card>
    );
  }

  const statusBadge = (status: string) => {
    const toneMap: Record<string, "success" | "info" | "warning" | "critical" | "new"> = {
      sent: "success", sending: "info", scheduled: "warning", draft: "new", failed: "critical",
    };
    return <Badge tone={toneMap[status] ?? "new"}>{status}</Badge>;
  };

  const rows = campaigns.map((c: any) => [
    <Button variant="plain" url={`/app/newsletter/campaigns/${c.id}`}>{c.name}</Button>,
    c.subject || "—",
    statusBadge(c.status),
    c.sentAt ? new Date(c.sentAt).toLocaleDateString() : "—",
    c.recipientCount ? c.recipientCount.toLocaleString() : "—",
    c.openCount ? `${Math.round((c.openCount / Math.max(c.recipientCount, 1)) * 100)}%` : "—",
    c.clickCount ? `${Math.round((c.clickCount / Math.max(c.recipientCount, 1)) * 100)}%` : "—",
    c.revenueAttributed ? `$${c.revenueAttributed.toFixed(0)}` : "—",
    <Button variant="plain" tone="critical" onClick={() => deleteCampaign(c.id, c.name)}>Delete</Button>,
  ]);

  return (
    <Card>
      <BlockStack gap="400">
        <InlineStack align="space-between">
          <Text as="h2" variant="headingSm">{campaigns.length} newsletter{campaigns.length !== 1 ? "s" : ""}</Text>
          <Button variant="primary" url="/app/newsletter/campaigns/new">New newsletter</Button>
        </InlineStack>
        <DataTable
          columnContentTypes={["text","text","text","text","numeric","text","text","numeric","text"]}
          headings={["Name","Subject","Status","Sent date","Recipients","Open rate","Click rate","Revenue","Actions"]}
          rows={rows}
        />
      </BlockStack>
    </Card>
  );
}
