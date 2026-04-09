// app/routes/app.newsletter.flows._index.tsx
// Automation flows list — pre-built templates + created flows.

import { json, type ActionFunctionArgs, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, useFetcher, useNavigate } from "@remix-run/react";
import { authenticate } from "~/shopify.server";
import db from "~/db.server";
import {
  Badge, BlockStack, Button, Card, Divider, EmptyState,
  Grid, InlineStack, Page, Text,
} from "@shopify/polaris";

// ─── Pre-built flow templates ─────────────────────────────────────────────────

const FLOW_TEMPLATES = [
  {
    id: "welcome_series",
    name: "Welcome series",
    description: "Greet new subscribers and warm them up over 7 days.",
    trigger: "subscriber_created",
    triggerLabel: "New subscriber",
    color: "#008060",
    icon: "👋",
    steps: [
      { position: 0, delayDays: 0, delayHours: 0, subject: "Welcome to {shop}!", htmlContent: null },
      { position: 1, delayDays: 3, delayHours: 0, subject: "Here's what we've been up to at {shop}", htmlContent: null },
      { position: 2, delayDays: 7, delayHours: 0, subject: "A special offer just for you, {name}", htmlContent: null },
    ],
  },
  {
    id: "post_purchase",
    name: "Post-purchase",
    description: "Thank customers, request a review, then offer an upsell.",
    trigger: "order_created",
    triggerLabel: "New order",
    color: "#4f46e5",
    icon: "🛍️",
    steps: [
      { position: 0, delayDays: 0, delayHours: 2, subject: "Thank you for your order, {name}!", htmlContent: null },
      { position: 1, delayDays: 7, delayHours: 0, subject: "How was your order from {shop}?", htmlContent: null },
      { position: 2, delayDays: 14, delayHours: 0, subject: "Customers who bought that also love these…", htmlContent: null },
    ],
  },
  {
    id: "win_back",
    name: "Win-back",
    description: "Re-engage subscribers who haven't opened in 60 days.",
    trigger: "win_back",
    triggerLabel: "Inactive 60 days",
    color: "#f59e0b",
    icon: "💛",
    steps: [
      { position: 0, delayDays: 0, delayHours: 0, subject: "We miss you, {name} 👋", htmlContent: null },
      { position: 1, delayDays: 3, delayHours: 0, subject: "One last thing before you go…", htmlContent: null },
    ],
  },
  {
    id: "abandoned_cart",
    name: "Abandoned cart",
    description: "Recover lost sales by following up on abandoned carts.",
    trigger: "cart_abandoned",
    triggerLabel: "Cart abandoned",
    color: "#e11d48",
    icon: "🛒",
    steps: [
      { position: 0, delayDays: 0, delayHours: 1, subject: "You left something behind, {name}", htmlContent: null },
      { position: 1, delayDays: 1, delayHours: 0, subject: "Your cart is about to expire", htmlContent: null },
      { position: 2, delayDays: 3, delayHours: 0, subject: "Last chance — 10% off your cart", htmlContent: null },
    ],
  },
  {
    id: "vip_loyalty",
    name: "VIP / loyalty",
    description: "Reward customers who have placed 3+ orders.",
    trigger: "order_created",
    triggerLabel: "New order",
    color: "#7c3aed",
    icon: "⭐",
    steps: [
      { position: 0, delayDays: 1, delayHours: 0, subject: "You've unlocked VIP status, {name}!", htmlContent: null },
      { position: 1, delayDays: 7, delayHours: 0, subject: "Your exclusive member offers this week", htmlContent: null },
    ],
  },
  {
    id: "birthday",
    name: "Birthday",
    description: "Send a birthday message and discount to celebrate.",
    trigger: "subscriber_created",
    triggerLabel: "New subscriber",
    color: "#ec4899",
    icon: "🎂",
    steps: [
      { position: 0, delayDays: 0, delayHours: 0, subject: "Happy birthday, {name}! 🎉", htmlContent: null },
    ],
  },
];

// ─── Loader ───────────────────────────────────────────────────────────────────

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const anyDb = db as any;

  const flows = await anyDb.automationFlow.findMany({
    where: { shop },
    include: { steps: true, _count: { select: { enrollments: true } } },
    orderBy: { createdAt: "desc" },
  }).catch(() => []);

  const activeEnrollments = await anyDb.automationEnrollment?.count?.({
    where: { shop, status: "active" },
  }).catch(() => 0);

  return json({ flows: flows ?? [], activeEnrollments });
}

// ─── Action ───────────────────────────────────────────────────────────────────

export async function action({ request }: ActionFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const anyDb = db as any;
  const body = await request.json().catch(() => ({}));

  if (body.intent === "create_from_template") {
    const tpl = FLOW_TEMPLATES.find(t => t.id === body.templateId);
    if (!tpl) return json({ error: "Template not found" }, { status: 404 });

    const flow = await anyDb.automationFlow.create({
      data: {
        shop,
        name: tpl.name,
        description: tpl.description,
        trigger: tpl.trigger,
        enabled: false,
        steps: { create: tpl.steps },
      },
    });
    return json({ ok: true, flowId: flow.id });
  }

  if (body.intent === "toggle") {
    await anyDb.automationFlow.update({
      where: { id: body.flowId },
      data: { enabled: !!body.enabled },
    });
    return json({ ok: true });
  }

  if (body.intent === "delete") {
    await anyDb.automationFlow.delete({ where: { id: body.flowId } });
    return json({ ok: true });
  }

  return json({ ok: false });
}

// ─── Component ───────────────────────────────────────────────────────────────

const TRIGGER_LABELS: Record<string, string> = {
  subscriber_created: "New subscriber",
  order_created: "New order",
  win_back: "Inactive 60 days",
  cart_abandoned: "Cart abandoned",
};

export default function FlowsIndex() {
  const { flows, activeEnrollments } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<any>();
  const navigate = useNavigate();

  function createFromTemplate(templateId: string) {
    fetcher.submit({ intent: "create_from_template", templateId }, { method: "post", encType: "application/json" });
  }

  function toggleFlow(flowId: string, enabled: boolean) {
    fetcher.submit({ intent: "toggle", flowId, enabled }, { method: "post", encType: "application/json" });
  }

  function deleteFlow(flowId: string) {
    fetcher.submit({ intent: "delete", flowId }, { method: "post", encType: "application/json" });
  }

  // Navigate to editor after creation
  if (fetcher.data?.flowId) {
    navigate(`/app/newsletter/flows/${fetcher.data.flowId}`);
  }

  return (
    <Page
      fullWidth
      title="Flows"
      subtitle="Automated email sequences triggered by subscriber and order events"
      primaryAction={{ content: "New blank flow", url: "/app/newsletter/flows/new" }}
    >
      <BlockStack gap="600">

        {/* Stats */}
        <Grid>
          {[
            { label: "Active flows", value: String(flows.filter((f: any) => f.enabled).length) },
            { label: "Total flows", value: String(flows.length) },
            { label: "Active enrollments", value: String(activeEnrollments) },
          ].map(kpi => (
            <Grid.Cell key={kpi.label} columnSpan={{ xs: 6, sm: 4, md: 4, lg: 4, xl: 4 }}>
              <Card><BlockStack gap="100">
                <Text as="p" variant="bodySm" tone="subdued">{kpi.label}</Text>
                <Text as="p" variant="heading2xl">{kpi.value}</Text>
              </BlockStack></Card>
            </Grid.Cell>
          ))}
        </Grid>

        {/* Your flows */}
        {flows.length > 0 && (
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">Your flows</Text>
              <BlockStack gap="300">
                {flows.map((flow: any) => (
                  <div key={flow.id} style={{ borderTop: "1px solid #e5e7eb", paddingTop: 16 }}>
                    <InlineStack align="space-between" blockAlign="center" gap="400">
                      <BlockStack gap="100">
                        <InlineStack gap="200" blockAlign="center">
                          <Text as="p" variant="bodyMd" fontWeight="semibold">{flow.name}</Text>
                          <Badge tone={flow.enabled ? "success" : "attention"}>
                            {flow.enabled ? "Active" : "Paused"}
                          </Badge>
                          <Badge>{TRIGGER_LABELS[flow.trigger] ?? flow.trigger}</Badge>
                        </InlineStack>
                        <Text as="p" variant="bodySm" tone="subdued">
                          {flow.steps.length} step{flow.steps.length !== 1 ? "s" : ""} · {flow._count?.enrollments ?? 0} total enrollments
                        </Text>
                      </BlockStack>
                      <InlineStack gap="200">
                        <Button size="slim" onClick={() => toggleFlow(flow.id, !flow.enabled)}>
                          {flow.enabled ? "Pause" : "Activate"}
                        </Button>
                        <Button size="slim" url={`/app/newsletter/flows/${flow.id}`}>Edit</Button>
                        <Button size="slim" tone="critical" onClick={() => deleteFlow(flow.id)}>Delete</Button>
                      </InlineStack>
                    </InlineStack>
                  </div>
                ))}
              </BlockStack>
            </BlockStack>
          </Card>
        )}

        {/* Template gallery */}
        <Card>
          <BlockStack gap="400">
            <BlockStack gap="050">
              <Text as="h2" variant="headingMd">Start from a template</Text>
              <Text as="p" variant="bodySm" tone="subdued">
                Pre-built flows you can activate in one click — customise the emails inside.
              </Text>
            </BlockStack>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
              {FLOW_TEMPLATES.map(tpl => {
                const alreadyCreated = flows.some((f: any) => f.name === tpl.name);
                return (
                  <div key={tpl.id} style={{ border: "1.5px solid #e1e3e5", borderRadius: 12, overflow: "hidden" }}>
                    <div style={{ height: 5, background: tpl.color }} />
                    <div style={{ padding: "16px 18px 18px" }}>
                      <InlineStack align="space-between" blockAlign="start" gap="200">
                        <BlockStack gap="100">
                          <InlineStack gap="200" blockAlign="center">
                            <span style={{ fontSize: 20 }}>{tpl.icon}</span>
                            <Text as="p" variant="bodyMd" fontWeight="semibold">{tpl.name}</Text>
                          </InlineStack>
                          <Text as="p" variant="bodySm" tone="subdued">{tpl.description}</Text>
                        </BlockStack>
                      </InlineStack>
                      <div style={{ marginTop: 12, display: "flex", gap: 6, flexWrap: "wrap" }}>
                        <span style={{ fontSize: 11, background: "#f3f4f6", color: "#374151", padding: "3px 8px", borderRadius: 99, fontWeight: 600 }}>
                          ⚡ {tpl.triggerLabel}
                        </span>
                        <span style={{ fontSize: 11, background: "#f3f4f6", color: "#374151", padding: "3px 8px", borderRadius: 99, fontWeight: 600 }}>
                          ✉️ {tpl.steps.length} email{tpl.steps.length !== 1 ? "s" : ""}
                        </span>
                      </div>
                      <div style={{ marginTop: 14 }}>
                        {alreadyCreated ? (
                          <Button size="slim" disabled>Already added</Button>
                        ) : (
                          <Button size="slim" variant="primary" onClick={() => createFromTemplate(tpl.id)} loading={fetcher.state !== "idle"}>
                            Use template
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </BlockStack>
        </Card>

      </BlockStack>
    </Page>
  );
}
