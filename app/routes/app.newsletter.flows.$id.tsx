// app/routes/app.newsletter.flows.$id.tsx
// Flow editor — configure trigger, steps, delays, and email content.

import { json, type ActionFunctionArgs, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, useFetcher, useNavigate } from "@remix-run/react";
import { authenticate } from "~/shopify.server";
import db from "~/db.server";
import {
  Badge, Banner, BlockStack, Button, Card, Divider,
  InlineStack, Page, Text, TextField,
} from "@shopify/polaris";
import { useState, useEffect } from "react";

// ─── Loader ───────────────────────────────────────────────────────────────────

export async function loader({ params, request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const anyDb = db as any;

  const flow = await anyDb.automationFlow.findFirst({
    where: { id: params.id, shop },
    include: { steps: { orderBy: { position: "asc" } }, _count: { select: { enrollments: true } } },
  });

  if (!flow) throw new Response("Not found", { status: 404 });

  const enrollmentStats = await anyDb.automationEnrollment.groupBy({
    by: ["status"],
    where: { flowId: flow.id },
    _count: { id: true },
  }).catch(() => []);

  const stats: Record<string, number> = { active: 0, completed: 0, cancelled: 0 };
  for (const s of enrollmentStats) stats[s.status] = s._count.id;

  return json({ flow, stats });
}

// ─── Action ───────────────────────────────────────────────────────────────────

export async function action({ params, request }: ActionFunctionArgs) {
  const { session, admin } = await authenticate.admin(request);
  const shop = session.shop;
  const anyDb = db as any;
  const body = await request.json().catch(() => ({}));

  if (body.intent === "update_flow") {
    if (body.enabled) {
      const steps = await anyDb.automationStep.findMany({ where: { flowId: params.id } });
      const emptySteps = steps.filter((s: any) => !s.htmlContent);
      if (emptySteps.length > 0) {
        return json({
          ok: false,
          error: `${emptySteps.length} email step${emptySteps.length !== 1 ? "s are" : " is"} missing content. Add email content to every step before activating.`,
        });
      }
    }
    await anyDb.automationFlow.updateMany({
      where: { id: params.id, shop },
      data: { name: body.name, description: body.description, enabled: !!body.enabled },
    });
    return json({ ok: true });
  }

  if (body.intent === "add_step") {
    const flow = await anyDb.automationFlow.findFirst({ where: { id: params.id, shop } });
    if (!flow) return json({ ok: false, error: "Flow not found" }, { status: 404 });
    const { getStoreBrand } = await import("~/email/brand.server");
    const { findTemplate } = await import("~/email/templates");
    const { renderEmail } = await import("~/email/blocks");
    const template = findTemplate(flow.trigger === "subscriber_created" ? "welcome" : "blank");
    const doc = template.build(await getStoreBrand(shop, admin));
    const position = await anyDb.automationStep.count({ where: { flowId: params.id } });
    const step = await anyDb.automationStep.create({
      data: {
        flowId: params.id!,
        position,
        delayDays: position === 0 ? 0 : 1,
        delayHours: 0,
        subject: template.subject,
        designJson: doc,
        htmlContent: renderEmail(doc),
      },
    });
    return json({ ok: true, stepId: step.id });
  }

  if (body.intent === "delete_step") {
    await anyDb.automationStep.deleteMany({ where: { id: body.stepId, flowId: params.id, flow: { shop } } });
    // Re-number remaining steps
    const remaining = await anyDb.automationStep.findMany({ where: { flowId: params.id }, orderBy: { position: "asc" } });
    for (let i = 0; i < remaining.length; i++) {
      await anyDb.automationStep.update({ where: { id: remaining[i].id }, data: { position: i } });
    }
    return json({ ok: true });
  }

  return json({ ok: false });
}

// ─── Component ───────────────────────────────────────────────────────────────

const TRIGGER_OPTIONS = [
  { label: "New subscriber", value: "subscriber_created" },
  { label: "New order", value: "order_created" },
  { label: "Win-back (inactive)", value: "win_back" },
  { label: "Cart abandoned", value: "cart_abandoned" },
];

const CARD_W = 160, CARD_H = 120, IFRAME_W = 600;
const SCALE = CARD_W / IFRAME_W;
const IFRAME_H = Math.round(CARD_H / SCALE);

function delayLabel(days: number, hours: number) {
  if (days === 0 && hours === 0) return "Immediately";
  const parts = [];
  if (days > 0) parts.push(`${days} day${days !== 1 ? "s" : ""}`);
  if (hours > 0) parts.push(`${hours} hour${hours !== 1 ? "s" : ""}`);
  return `Wait ${parts.join(" ")}`;
}

export default function FlowEditor() {
  const { flow, stats } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<any>();

  const [name, setName] = useState(flow.name);
  const [enabled, setEnabled] = useState(flow.enabled);

  const navigate = useNavigate();
  const isSaving = fetcher.state !== "idle";
  const [flowError, setFlowError] = useState<string | null>(null);

  useEffect(() => {
    if (fetcher.data && !fetcher.data.ok) {
      if (fetcher.data.error) {
        setFlowError(fetcher.data.error);
        setEnabled(flow.enabled); // revert optimistic toggle
      }
    } else if (fetcher.data?.ok) {
      setFlowError(null);
    }
  }, [fetcher.data]);

  // A newly added step opens straight in the email editor.
  useEffect(() => {
    if (fetcher.data?.stepId) navigate(`/app/newsletter/flows/${flow.id}/steps/${fetcher.data.stepId}`);
  }, [fetcher.data?.stepId]);

  function saveFlow() {
    fetcher.submit({ intent: "update_flow", name, enabled }, { method: "post", encType: "application/json" });
  }

  function toggleEnabled() {
    const next = !enabled;
    setEnabled(next);
    fetcher.submit({ intent: "update_flow", name, enabled: next }, { method: "post", encType: "application/json" });
  }

  function openEditStep(step: any | null) {
    if (step) navigate(`/app/newsletter/flows/${flow.id}/steps/${step.id}`);
    else fetcher.submit({ intent: "add_step" }, { method: "post", encType: "application/json" });
  }

  function deleteStep(stepId: string) {
    fetcher.submit({ intent: "delete_step", stepId }, { method: "post", encType: "application/json" });
  }

  const triggerLabel = TRIGGER_OPTIONS.find(t => t.value === flow.trigger)?.label ?? flow.trigger;

  return (
    <Page
      title={flow.name}
      backAction={{ content: "Flows", url: "/app/newsletter/flows" }}
      primaryAction={{ content: isSaving ? "Saving…" : "Save", onAction: saveFlow, loading: isSaving }}
      secondaryActions={[{ content: enabled ? "Pause flow" : "Activate flow", onAction: toggleEnabled }]}
    >
      <BlockStack gap="500">

        {flowError && (
          <Banner tone="warning" onDismiss={() => setFlowError(null)}>
            {flowError}
          </Banner>
        )}

        {/* Flow settings */}
        <Card>
          <BlockStack gap="400">
            <InlineStack align="space-between" blockAlign="center">
              <BlockStack gap="050">
                <Text as="h2" variant="headingSm">Flow settings</Text>
              </BlockStack>
              <Badge tone={enabled ? "success" : "attention"}>{enabled ? "Active" : "Paused"}</Badge>
            </InlineStack>
            <Divider />
            <InlineStack gap="400" wrap>
              <div style={{ flex: 1, minWidth: 200 }}>
                <TextField label="Flow name" value={name} onChange={setName} autoComplete="off" />
              </div>
              <div style={{ minWidth: 200 }}>
                <Text as="p" variant="bodySm" fontWeight="semibold">Trigger</Text>
                <div style={{ marginTop: 6 }}>
                  <Badge>{triggerLabel}</Badge>
                  <Text as="p" variant="bodySm" tone="subdued" >Change trigger by creating a new flow from a template.</Text>
                </div>
              </div>
            </InlineStack>
            <InlineStack gap="400">
              <div style={{ background: "#f0fdf4", border: "1px solid #86efac", borderRadius: 8, padding: "8px 16px" }}>
                <Text as="p" variant="bodySm"><strong>{stats.active}</strong> active · <strong>{stats.completed}</strong> completed · <strong>{stats.cancelled}</strong> cancelled</Text>
              </div>
            </InlineStack>
          </BlockStack>
        </Card>

        {/* Flow steps timeline */}
        <Card>
          <BlockStack gap="400">
            <InlineStack align="space-between" blockAlign="center">
              <Text as="h2" variant="headingSm">Steps</Text>
              <Button size="slim" onClick={() => openEditStep(null)}>+ Add step</Button>
            </InlineStack>
            <Divider />

            {flow.steps.length === 0 ? (
              <div style={{ textAlign: "center", padding: "32px 0" }}>
                <Text as="p" variant="bodyMd" tone="subdued">No steps yet. Add your first email step above.</Text>
              </div>
            ) : (
              <div style={{ position: "relative" }}>
                {/* Vertical line */}
                <div style={{ position: "absolute", left: 19, top: 40, bottom: 40, width: 2, background: "#e5e7eb", zIndex: 0 }} />
                <BlockStack gap="400">
                  {/* Trigger node */}
                  <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
                    <div style={{ width: 40, height: 40, borderRadius: "50%", background: "#4f46e5", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, zIndex: 1, color: "#fff", fontSize: 16 }}>⚡</div>
                    <div style={{ paddingTop: 8 }}>
                      <Text as="p" variant="bodyMd" fontWeight="semibold">Trigger: {triggerLabel}</Text>
                      <Text as="p" variant="bodySm" tone="subdued">Flow starts when this event fires</Text>
                    </div>
                  </div>

                  {flow.steps.map((step: any, idx: number) => (
                    <div key={step.id} style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
                      <div style={{ width: 40, height: 40, borderRadius: "50%", background: "#fff", border: "2px solid #4f46e5", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, zIndex: 1, fontWeight: 700, fontSize: 14, color: "#4f46e5" }}>
                        {idx + 1}
                      </div>
                      <div style={{ flex: 1, border: "1.5px solid #e1e3e5", borderRadius: 10, overflow: "hidden", background: "#fff" }}>
                        <div style={{ padding: "12px 16px", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                          <BlockStack gap="050">
                            <InlineStack gap="200" blockAlign="center">
                              <span style={{ fontSize: 11, background: "#ede9fe", color: "#7c3aed", padding: "2px 8px", borderRadius: 99, fontWeight: 700 }}>
                                {delayLabel(step.delayDays, step.delayHours)}
                              </span>
                              <span style={{ fontSize: 11, background: "#f3f4f6", color: "#374151", padding: "2px 8px", borderRadius: 99 }}>Email</span>
                            </InlineStack>
                            <Text as="p" variant="bodyMd" fontWeight="semibold">{step.subject || "(no subject)"}</Text>
                          </BlockStack>
                          <InlineStack gap="150">
                            <Button size="slim" onClick={() => openEditStep(step)}>Edit</Button>
                            <Button size="slim" tone="critical" onClick={() => deleteStep(step.id)}>✕</Button>
                          </InlineStack>
                        </div>
                        {step.htmlContent && (
                          <div style={{ height: CARD_H, overflow: "hidden", borderTop: "1px solid #f3f4f6", pointerEvents: "none", position: "relative" }}>
                            <iframe srcDoc={step.htmlContent} title="preview" scrolling="no" style={{ width: IFRAME_W, height: IFRAME_H, border: "none", transform: `scale(${SCALE})`, transformOrigin: "top left", pointerEvents: "none" }} />
                          </div>
                        )}
                      </div>
                    </div>
                  ))}

                  {/* End node */}
                  <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
                    <div style={{ width: 40, height: 40, borderRadius: "50%", background: "#f3f4f6", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, zIndex: 1, fontSize: 16 }}>🏁</div>
                    <div style={{ paddingTop: 8 }}>
                      <Text as="p" variant="bodyMd" fontWeight="semibold">Flow complete</Text>
                      <Text as="p" variant="bodySm" tone="subdued">Contact is marked as completed</Text>
                    </div>
                  </div>
                </BlockStack>
              </div>
            )}
          </BlockStack>
        </Card>

      </BlockStack>

    </Page>
  );
}
