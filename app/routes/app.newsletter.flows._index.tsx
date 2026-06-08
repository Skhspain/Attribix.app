// app/routes/app.newsletter.flows._index.tsx
// Automation flows list — pre-built templates + created flows.

import { json, type ActionFunctionArgs, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, useFetcher, useNavigate } from "@remix-run/react";
import { authenticate } from "~/shopify.server";
import db from "~/db.server";
import {
  Badge, Banner, BlockStack, Button, Card, Divider, EmptyState,
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

  return json({ flows: flows ?? [], activeEnrollments, shop });
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
    if (body.enabled) {
      const flow = await anyDb.automationFlow.findUnique({
        where: { id: body.flowId },
        include: { steps: true },
      });
      const emptySteps = (flow?.steps ?? []).filter((s: any) => !s.htmlContent);
      if (emptySteps.length > 0) {
        return json({
          ok: false,
          error: `${emptySteps.length} email step${emptySteps.length !== 1 ? "s are" : " is"} missing content. Click "Edit flow" to add email content before activating.`,
        });
      }
    }
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

import { useState, useEffect } from "react";

const TRIGGER_LABELS: Record<string, string> = {
  subscriber_created: "When someone subscribes",
  order_created: "When someone places an order",
  win_back: "When inactive 60+ days",
  cart_abandoned: "When cart is abandoned",
};

const TRIGGER_DESC: Record<string, string> = {
  subscriber_created: "This flow starts when a new subscriber joins your list.",
  order_created: "This flow starts when a customer places an order.",
  win_back: "This flow starts when a subscriber hasn't opened in 60 days.",
  cart_abandoned: "This flow starts when a customer abandons their cart.",
};

const FLOW_ICONS: Record<string, string> = {
  "Welcome series": "👋",
  "Post-purchase": "🛍️",
  "Abandoned cart": "🛒",
  "Win-back": "💛",
  "VIP / loyalty": "⭐",
  "Birthday": "🎂",
};

const FLOW_COLORS: Record<string, string> = {
  "Welcome series": "#008060",
  "Post-purchase": "#4F46E5",
  "Abandoned cart": "#E11D48",
  "Win-back": "#F59E0B",
  "VIP / loyalty": "#7C3AED",
  "Birthday": "#EC4899",
};

function FlowCanvas({ flow, shopName }: { flow: any; shopName: string }) {
  const trigger = flow.trigger;
  const steps = [...(flow.steps || [])].sort((a: any, b: any) => a.position - b.position);
  const color = FLOW_COLORS[flow.name] || "#6B7280";

  const Block = ({ icon, label, sub, bg, border }: { icon: string; label: string; sub?: string; bg: string; border: string }) => (
    <div style={{ background: bg, border: `1px solid ${border}`, borderRadius: 10, padding: "12px 16px", width: 280, cursor: "default" }}>
      <InlineStack gap="200" blockAlign="center">
        <span style={{ fontSize: 16 }}>{icon}</span>
        <BlockStack gap="025">
          <Text as="p" variant="bodySm" fontWeight="semibold">{label}</Text>
          {sub && <Text as="p" variant="bodySm" tone="subdued">{sub}</Text>}
        </BlockStack>
      </InlineStack>
    </div>
  );

  const Connector = () => (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, padding: "4px 0" }}>
      <div style={{ width: 2, height: 16, background: "#E5E7EB" }} />
      <div style={{ width: 0, height: 0, borderLeft: "5px solid transparent", borderRight: "5px solid transparent", borderTop: "6px solid #E5E7EB" }} />
    </div>
  );

  const emailNum = { current: 0 };

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "24px 0" }}>
      {/* Trigger */}
      <Block
        icon="⚡"
        label={`Trigger`}
        sub={TRIGGER_LABELS[trigger] ?? trigger}
        bg="#EFF6FF"
        border="#BFDBFE"
      />

      {steps.map((step: any, i: number) => {
        emailNum.current++;
        const hasDelay = (step.delayDays || 0) + (step.delayHours || 0) > 0;
        const delayLabel = step.delayDays > 0
          ? `Wait ${step.delayDays} day${step.delayDays !== 1 ? "s" : ""}`
          : step.delayHours > 0
            ? `Wait ${step.delayHours} hour${step.delayHours !== 1 ? "s" : ""}`
            : "Send immediately";

        return (
          <div key={step.id || i} style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
            <Connector />
            {hasDelay && (
              <>
                <div style={{ background: "#F9FAFB", border: "1px solid #E5E7EB", borderRadius: 8, padding: "8px 16px", display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 14 }}>⏱</span>
                  <Text as="p" variant="bodySm" tone="subdued">{delayLabel}</Text>
                </div>
                <Connector />
              </>
            )}
            <Block
              icon={step.htmlContent ? "✉" : "⚠️"}
              label={`Email #${emailNum.current}${!step.htmlContent ? " — no content" : ""}`}
              sub={(step.subject || "No subject set").replace(/\{shop\}/gi, shopName)}
              bg={step.htmlContent ? "#FAFAFA" : "#FEF9C3"}
              border={step.htmlContent ? "#E5E7EB" : "#FDE047"}
            />
          </div>
        );
      })}

      <Connector />
      <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#D1D5DB" }} />
    </div>
  );
}

export default function FlowsIndex() {
  const { flows, activeEnrollments, shop } = useLoaderData<typeof loader>();
  const shopName = shop.replace(".myshopify.com", "");
  const fetcher = useFetcher<any>();
  const navigate = useNavigate();
  const [filter, setFilter] = useState<"all" | "active" | "draft" | "paused">("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showTemplates, setShowTemplates] = useState(false);
  const [toggleError, setToggleError] = useState<string | null>(null);

  useEffect(() => {
    if (fetcher.data && !fetcher.data.ok && fetcher.data.error) {
      setToggleError(fetcher.data.error);
    }
  }, [fetcher.data]);

  // Auto-select first flow whenever the list changes (handles initial load + after creation)
  useEffect(() => {
    if (flows.length > 0 && !selectedId) {
      setSelectedId(flows[0].id);
    }
  }, [flows]);

  function createFromTemplate(templateId: string) {
    fetcher.submit({ intent: "create_from_template", templateId }, { method: "post", encType: "application/json" });
  }

  function toggleFlow(flowId: string, enabled: boolean) {
    fetcher.submit({ intent: "toggle", flowId, enabled }, { method: "post", encType: "application/json" });
  }

  function deleteFlow(flowId: string) {
    if (!confirm("Delete this flow?")) return;
    if (selectedId === flowId) setSelectedId(flows.find((f: any) => f.id !== flowId)?.id ?? null);
    fetcher.submit({ intent: "delete", flowId }, { method: "post", encType: "application/json" });
  }

  if (fetcher.data?.flowId) {
    navigate(`/app/newsletter/flows/${fetcher.data.flowId}`);
  }

  const filteredFlows = flows.filter((f: any) => {
    if (filter === "active") return f.enabled;
    if (filter === "draft") return !f.enabled && f.steps?.length === 0;
    if (filter === "paused") return !f.enabled && f.steps?.length > 0;
    return true;
  });

  const selectedFlow = flows.find((f: any) => f.id === selectedId) ?? null;

  if (flows.length === 0 || showTemplates) {
    return (
      <Page
        title="Flows"
        subtitle="Automate emails and follow-ups based on subscriber actions and events."
        primaryAction={{ content: "New flow", onAction: () => setShowTemplates(true) }}
      >
        <BlockStack gap="500">
          {flows.length === 0 && (
            <div style={{ padding: "24px", background: "#F9FAFB", borderRadius: 10, textAlign: "center" }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>⚡</div>
              <Text as="p" variant="headingMd">No flows yet</Text>
              <div style={{ marginTop: 6, marginBottom: 20 }}>
                <Text as="p" variant="bodySm" tone="subdued">Start from a template to create your first automation.</Text>
              </div>
            </div>
          )}
          <Card>
            <BlockStack gap="400">
              <InlineStack align="space-between" blockAlign="center">
                <BlockStack gap="025">
                  <Text as="h2" variant="headingMd">Start from a template</Text>
                  <Text as="p" variant="bodySm" tone="subdued">Pre-built flows you can activate in one click.</Text>
                </BlockStack>
                {showTemplates && flows.length > 0 && (
                  <Button size="slim" onClick={() => setShowTemplates(false)}>← Back to flows</Button>
                )}
              </InlineStack>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
                {FLOW_TEMPLATES.map(tpl => {
                  const alreadyCreated = flows.some((f: any) => f.name === tpl.name);
                  return (
                    <div key={tpl.id} style={{ border: "1px solid #E5E7EB", borderRadius: 10, overflow: "hidden", cursor: "pointer" }}
                      onMouseEnter={e => (e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.08)")}
                      onMouseLeave={e => (e.currentTarget.style.boxShadow = "none")}>
                      <div style={{ height: 4, background: tpl.color }} />
                      <div style={{ padding: "14px 16px 16px" }}>
                        <InlineStack gap="200" blockAlign="center">
                          <span style={{ fontSize: 22 }}>{tpl.icon}</span>
                          <Text as="p" variant="headingSm" fontWeight="semibold">{tpl.name}</Text>
                        </InlineStack>
                        <div style={{ marginTop: 6 }}>
                          <Text as="p" variant="bodySm" tone="subdued">{tpl.description}</Text>
                        </div>
                        <div style={{ marginTop: 10, display: "flex", gap: 6 }}>
                          <span style={{ fontSize: 11, background: "#F3F4F6", color: "#374151", padding: "3px 8px", borderRadius: 99, fontWeight: 600 }}>⚡ {tpl.triggerLabel}</span>
                          <span style={{ fontSize: 11, background: "#F3F4F6", color: "#374151", padding: "3px 8px", borderRadius: 99, fontWeight: 600 }}>✉ {tpl.steps.length} email{tpl.steps.length !== 1 ? "s" : ""}</span>
                        </div>
                        <div style={{ marginTop: 12 }}>
                          {alreadyCreated
                            ? <Button size="slim" disabled>Already added</Button>
                            : <Button size="slim" variant="primary" loading={fetcher.state !== "idle"} onClick={() => createFromTemplate(tpl.id)}>Use template</Button>
                          }
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

  return (
    <Page
      fullWidth
      title="Flows"
      subtitle="Automate emails and follow-ups based on subscriber actions and events."
      primaryAction={{ content: "New flow", onAction: () => setShowTemplates(true) }}
    >
      {/* Three-panel layout */}
      <div style={{ display: "grid", gridTemplateColumns: "260px 1fr 300px", gap: 0, border: "1px solid #E5E7EB", borderRadius: 12, overflow: "hidden", minHeight: 600 }}>

        {/* LEFT: Flow list */}
        <div style={{ borderRight: "1px solid #E5E7EB", background: "#FAFAFA" }}>
          {/* Filter tabs */}
          <div style={{ padding: "12px 12px 0", borderBottom: "1px solid #E5E7EB" }}>
            <div style={{ display: "flex", gap: 0 }}>
              {(["all", "active", "draft", "paused"] as const).map(f => (
                <button key={f} onClick={() => setFilter(f)} style={{
                  flex: 1, padding: "6px 4px", border: "none", background: "transparent", cursor: "pointer",
                  fontSize: 12, fontWeight: 600, color: filter === f ? "#008060" : "#6B7280",
                  borderBottom: filter === f ? "2px solid #008060" : "2px solid transparent",
                  textTransform: "capitalize",
                }}>
                  {f === "all" ? "All" : f.charAt(0).toUpperCase() + f.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* Flow items */}
          <div style={{ padding: "8px" }}>
            {filteredFlows.map((flow: any) => {
              const icon = FLOW_ICONS[flow.name] || "⚡";
              const color = FLOW_COLORS[flow.name] || "#6B7280";
              const isSelected = flow.id === selectedId;
              return (
                <div key={flow.id}
                  onClick={() => setSelectedId(flow.id)}
                  style={{
                    padding: "12px", borderRadius: 8, cursor: "pointer", marginBottom: 4,
                    background: isSelected ? "#fff" : "transparent",
                    border: isSelected ? "1px solid #E5E7EB" : "1px solid transparent",
                    boxShadow: isSelected ? "0 1px 3px rgba(0,0,0,0.06)" : "none",
                  }}>
                  <InlineStack gap="200" blockAlign="start">
                    <div style={{ width: 32, height: 32, borderRadius: 8, background: color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0 }}>
                      {icon}
                    </div>
                    <BlockStack gap="025">
                      <InlineStack gap="100" blockAlign="center">
                        <Text as="p" variant="bodySm" fontWeight="semibold">{flow.name}</Text>
                        <Badge tone={flow.enabled ? "success" : "new"} size="small">
                          {flow.enabled ? "Active" : "Draft"}
                        </Badge>
                      </InlineStack>
                      <Text as="p" variant="bodySm" tone="subdued">{flow.description || TRIGGER_LABELS[flow.trigger] || ""}</Text>
                    </BlockStack>
                  </InlineStack>
                </div>
              );
            })}
          </div>

          {/* + New flow */}
          <div style={{ padding: "8px 12px", borderTop: "1px solid #E5E7EB", marginTop: 4 }}>
            <button onClick={() => setShowTemplates(true)} style={{
              width: "100%", padding: "10px", border: "1px dashed #D1D5DB", borderRadius: 8, background: "transparent",
              cursor: "pointer", fontSize: 13, color: "#6B7280", fontWeight: 600,
            }}>
              + New flow
            </button>
          </div>
        </div>

        {/* CENTER: Visual canvas */}
        <div style={{ background: "#F8F9FA", overflowY: "auto", display: "flex", flexDirection: "column", alignItems: "center" }}>
          {selectedFlow ? (
            <>
              <div style={{ width: "100%", padding: "16px 20px", background: "#fff", borderBottom: "1px solid #E5E7EB", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <BlockStack gap="025">
                  <Text as="p" variant="headingSm" fontWeight="semibold">{selectedFlow.name}</Text>
                  <Text as="p" variant="bodySm" tone="subdued">{selectedFlow.steps?.length || 0} steps · {selectedFlow._count?.enrollments || 0} enrollments</Text>
                </BlockStack>
                <InlineStack gap="200">
                  <Button size="slim" onClick={() => toggleFlow(selectedFlow.id, !selectedFlow.enabled)}>
                    {selectedFlow.enabled ? "Pause" : "Activate"}
                  </Button>
                  <Button size="slim" onClick={() => navigate(`/app/newsletter/flows/${selectedFlow.id}`)}>Edit flow</Button>
                  <Button size="slim" tone="critical" onClick={() => deleteFlow(selectedFlow.id)}>Delete</Button>
                </InlineStack>
              </div>
              {toggleError && (
                <div style={{ padding: "12px 16px 0", width: "100%" }}>
                  <Banner tone="warning" onDismiss={() => setToggleError(null)}>
                    {toggleError}
                  </Banner>
                </div>
              )}
              <FlowCanvas flow={selectedFlow} shopName={shopName} />
            </>
          ) : (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "#9CA3AF" }}>
              <Text as="p" variant="bodySm" tone="subdued">Select a flow to preview</Text>
            </div>
          )}
        </div>

        {/* RIGHT: Settings panel */}
        <div style={{ borderLeft: "1px solid #E5E7EB", background: "#fff" }}>
          {selectedFlow ? (
            <BlockStack gap="0">
              <div style={{ padding: "16px", borderBottom: "1px solid #F0F0F0" }}>
                <InlineStack align="space-between" blockAlign="center">
                  <Text as="p" variant="headingSm" fontWeight="semibold">Trigger</Text>
                </InlineStack>
                <div style={{ marginTop: 8 }}>
                  <Text as="p" variant="bodySm" fontWeight="semibold">{TRIGGER_LABELS[selectedFlow.trigger] ?? selectedFlow.trigger}</Text>
                </div>
              </div>

              <div style={{ padding: "16px", borderBottom: "1px solid #F0F0F0" }}>
                <Text as="p" variant="headingSm" fontWeight="semibold">Trigger details</Text>
                <div style={{ marginTop: 8 }}>
                  <Text as="p" variant="bodySm" tone="subdued">
                    {TRIGGER_DESC[selectedFlow.trigger] ?? "This flow starts based on the selected trigger."}
                  </Text>
                </div>
              </div>

              <div style={{ padding: "16px", borderBottom: "1px solid #F0F0F0" }}>
                <Text as="p" variant="headingSm" fontWeight="semibold">Settings</Text>
                {selectedFlow.trigger === "subscriber_created" && (
                  <div style={{ marginTop: 10 }}>
                    <Text as="p" variant="bodySm" tone="subdued">When a subscriber joins</Text>
                    <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
                      {["Any list (via any form)", "Specific list"].map((opt, i) => (
                        <label key={opt} style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13 }}>
                          <input type="radio" name="list" defaultChecked={i === 0} style={{ accentColor: "#008060" }} />
                          {opt}
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div style={{ padding: "16px" }}>
                <Text as="p" variant="headingSm" fontWeight="semibold">Additional filters</Text>
                <Text as="p" variant="bodySm" tone="subdued">Only start this flow if the subscriber matches these conditions.</Text>
                <div style={{ marginTop: 10 }}>
                  <Button size="slim">+ Add filter</Button>
                </div>
              </div>

              <div style={{ padding: "12px 16px", borderTop: "1px solid #F0F0F0", display: "flex", justifyContent: "space-between" }}>
                <Button size="slim" tone="critical" variant="plain">Delete trigger</Button>
                <Button size="slim" variant="primary" onClick={() => navigate(`/app/newsletter/flows/${selectedFlow.id}`)}>Save</Button>
              </div>
            </BlockStack>
          ) : (
            <div style={{ padding: 20 }}>
              <Text as="p" variant="bodySm" tone="subdued">Click a block in the canvas to edit its settings.</Text>
            </div>
          )}
        </div>

      </div>
    </Page>
  );
}
