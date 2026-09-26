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
    where: { shop, status: { not: "template" } },
    orderBy: { createdAt: "desc" },
    take: 100,
  }).catch(() => []) ?? [];

  // Revenue per campaign: orders from visits that started at a link in it
  // (links carry utm_campaign=<campaign id>).
  const revenueRows = campaigns.length
    ? await db.purchase.groupBy({
        by: ["utmCampaign", "currency"],
        where: { shop, utmMedium: "email", utmCampaign: { in: campaigns.map((c: any) => c.id) } },
        _sum: { totalValue: true },
      }).catch(() => [] as any[])
    : [];
  const revenue: Record<string, { amount: number; currency: string }> = {};
  for (const r of revenueRows as any[]) {
    const prev = revenue[r.utmCampaign];
    revenue[r.utmCampaign] = { amount: (prev?.amount ?? 0) + Number(r._sum?.totalValue ?? 0), currency: prev?.currency ?? r.currency ?? "USD" };
  }

  return json({ campaigns, revenue });
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
    if (campaign && campaign.shop === shop && campaign.status !== "sending") {
      await anyDb.newsletterSend.deleteMany({ where: { campaignId: id } });
      await anyDb.newsletterCampaign.delete({ where: { id } });
    }
  }

  return json({ ok: true });
}

export default function CampaignList() {
  const { campaigns, revenue } = useLoaderData<typeof loader>();
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
    const map: Record<string, { label: string; tone?: "success" | "info" | "attention" | "critical" }> = {
      sent: { label: "Sent", tone: "success" },
      sending: { label: "Sending", tone: "attention" },
      scheduled: { label: "Scheduled", tone: "info" },
      draft: { label: "Draft" },
      failed: { label: "Failed", tone: "critical" },
    };
    const b = map[status] ?? { label: status };
    return <Badge tone={b.tone}>{b.label}</Badge>;
  };
  const money = (r?: { amount: number; currency: string }) => {
    if (!r || !r.amount) return "—";
    try {
      return new Intl.NumberFormat(undefined, { style: "currency", currency: r.currency, maximumFractionDigits: 0 }).format(r.amount);
    } catch {
      return r.amount.toFixed(0);
    }
  };

  const rows = campaigns.map((c: any) => [
    <Button variant="plain" url={`/app/newsletter/campaigns/${c.id}`}>{c.name}</Button>,
    c.subject || "—",
    statusBadge(c.status),
    c.sentAt
      ? new Date(c.sentAt).toLocaleDateString()
      : c.status === "scheduled" && c.scheduledAt
        ? `Scheduled ${new Date(c.scheduledAt).toLocaleString()}`
        : "—",
    c.recipientCount != null ? c.recipientCount.toLocaleString() : "—",
    c.openCount ? `${Math.round((c.openCount / Math.max(c.recipientCount, 1)) * 100)}%` : "—",
    c.clickCount ? `${Math.round((c.clickCount / Math.max(c.recipientCount, 1)) * 100)}%` : "—",
    money(revenue[c.id]),
    c.status === "sending" ? "" : <Button variant="plain" tone="critical" onClick={() => deleteCampaign(c.id, c.name)}>Delete</Button>,
  ]);

  return (
    <Card>
      <BlockStack gap="400">
        <InlineStack align="space-between">
          <Text as="h2" variant="headingSm">{campaigns.length} newsletter{campaigns.length !== 1 ? "s" : ""}</Text>
          <Button variant="primary" url="/app/newsletter/campaigns/new">New newsletter</Button>
        </InlineStack>
        <DataTable
          columnContentTypes={["text","text","text","text","text","text","text","numeric","text"]}
          headings={["Name","Subject","Status","Sent date","Recipients","Open rate","Click rate","Revenue","Actions"]}
          rows={rows}
        />
      </BlockStack>
    </Card>
  );
}
