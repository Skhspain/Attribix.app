// app/routes/app.newsletter.flows.$id.tsx
// Flow editor — configure trigger, steps, delays, and email content.

import { json, type ActionFunctionArgs, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, useFetcher } from "@remix-run/react";
import { authenticate } from "~/shopify.server";
import db from "~/db.server";
import {
  Badge, BlockStack, Button, Card, Checkbox, Divider,
  InlineStack, Modal, Page, Select, Text, TextField,
} from "@shopify/polaris";
import { useState, useEffect } from "react";
import { EMAIL_TEMPLATES } from "~/data/emailTemplates";

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
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const anyDb = db as any;
  const body = await request.json().catch(() => ({}));

  if (body.intent === "update_flow") {
    await anyDb.automationFlow.updateMany({
      where: { id: params.id, shop },
      data: { name: body.name, description: body.description, enabled: !!body.enabled },
    });
    return json({ ok: true });
  }

  if (body.intent === "upsert_step") {
    if (body.stepId) {
      await anyDb.automationStep.update({
        where: { id: body.stepId },
        data: { delayDays: Number(body.delayDays ?? 0), delayHours: Number(body.delayHours ?? 0), subject: body.subject ?? "", htmlContent: body.htmlContent ?? null },
      });
    } else {
      const existing = await anyDb.automationStep.count({ where: { flowId: params.id } });
      await anyDb.automationStep.create({
        data: { flowId: params.id!, position: existing, delayDays: Number(body.delayDays ?? 1), delayHours: 0, subject: body.subject ?? "New email", htmlContent: body.htmlContent ?? null },
      });
    }
    return json({ ok: true });
  }

  if (body.intent === "delete_step") {
    await anyDb.automationStep.delete({ where: { id: body.stepId } });
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
  const [editingStep, setEditingStep] = useState<any>(null);
  const [showTemplates, setShowTemplates] = useState(false);

  // Step editor state
  const [stepDelayDays, setStepDelayDays] = useState("0");
  const [stepDelayHours, setStepDelayHours] = useState("0");
  const [stepSubject, setStepSubject] = useState("");
  const [unlayerReady, setUnlayerReady] = useState(false);

  const isSaving = fetcher.state !== "idle";

  // Load Unlayer script once on mount
  useEffect(() => {
    if ((window as any).unlayer) { setUnlayerReady(true); return; }
    const script = document.createElement("script");
    script.src = "https://editor.unlayer.com/embed.js";
    script.async = true;
    script.onload = () => setUnlayerReady(true);
    document.head.appendChild(script);
  }, []);

  // Init/reload Unlayer each time a step is opened for editing
  useEffect(() => {
    if (!editingStep || !unlayerReady) return;
    const t = setTimeout(() => {
      const el = document.getElementById("flow-unlayer-editor");
      if (!el || !(window as any).unlayer) return;
      (window as any).unlayer.init({
        id: "flow-unlayer-editor",
        displayMode: "email",
        locale: "en-US",
        appearance: { theme: "modern_light" },
      });
      if (editingStep.htmlContent) {
        (window as any).unlayer.loadDesign({ html: editingStep.htmlContent, classic: true });
      }
    }, 150);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingStep?.id, unlayerReady]);

  function saveFlow() {
    fetcher.submit({ intent: "update_flow", name, enabled }, { method: "post", encType: "application/json" });
  }

  function openEditStep(step: any | null) {
    setEditingStep(step ?? { isNew: true });
    setStepDelayDays(String(step?.delayDays ?? 1));
    setStepDelayHours(String(step?.delayHours ?? 0));
    setStepSubject(step?.subject ?? "");
  }

  function saveStep() {
    const doSubmit = (htmlContent: string | null) => {
      fetcher.submit({
        intent: "upsert_step",
        stepId: editingStep?.id ?? null,
        delayDays: Number(stepDelayDays),
        delayHours: Number(stepDelayHours),
        subject: stepSubject,
        htmlContent,
      }, { method: "post", encType: "application/json" });
      setEditingStep(null);
    };
    if ((window as any).unlayer && unlayerReady) {
      (window as any).unlayer.exportHtml((data: { html: string }) => doSubmit(data.html || null));
    } else {
      doSubmit(null);
    }
  }

  function deleteStep(stepId: string) {
    fetcher.submit({ intent: "delete_step", stepId }, { method: "post", encType: "application/json" });
  }

  function applyTemplate(html: string, subject: string) {
    if (!stepSubject) setStepSubject(subject);
    setShowTemplates(false);
    if ((window as any).unlayer && unlayerReady) {
      setTimeout(() => (window as any).unlayer.loadDesign({ html, classic: true }), 50);
    }
  }

  const triggerLabel = TRIGGER_OPTIONS.find(t => t.value === flow.trigger)?.label ?? flow.trigger;

  return (
    <Page
      title={flow.name}
      backAction={{ content: "Flows", url: "/app/newsletter/flows" }}
      primaryAction={{ content: isSaving ? "Saving…" : "Save", onAction: saveFlow, loading: isSaving }}
      secondaryActions={[{ content: enabled ? "Pause flow" : "Activate flow", onAction: () => { setEnabled(!enabled); setTimeout(saveFlow, 50); } }]}
    >
      <BlockStack gap="500">

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

      {/* Step editor modal */}
      <Modal
        open={!!editingStep}
        onClose={() => setEditingStep(null)}
        title={editingStep?.id ? "Edit step" : "Add step"}
        size="large"
        primaryAction={{ content: "Save step", onAction: saveStep }}
        secondaryActions={[
          { content: showTemplates ? "Close templates" : "Pick template", onAction: () => setShowTemplates(!showTemplates) },
          { content: "Cancel", onAction: () => setEditingStep(null) },
        ]}
      >
        <Modal.Section>
          <BlockStack gap="400">
            <InlineStack gap="300">
              <div style={{ width: 120 }}>
                <TextField label="Delay (days)" type="number" value={stepDelayDays} onChange={setStepDelayDays} autoComplete="off" min="0" />
              </div>
              <div style={{ width: 120 }}>
                <TextField label="Delay (hours)" type="number" value={stepDelayHours} onChange={setStepDelayHours} autoComplete="off" min="0" max="23" />
              </div>
              <div style={{ flex: 1 }}>
                <Text as="p" variant="bodySm" tone="subdued" fontWeight="semibold">Timing</Text>
                <div style={{ marginTop: 8 }}>
                  <Badge>{delayLabel(Number(stepDelayDays), Number(stepDelayHours))}</Badge>
                </div>
              </div>
            </InlineStack>
            <TextField label="Subject line" value={stepSubject} onChange={setStepSubject} autoComplete="off" placeholder="e.g. Welcome to {shop}, {name}!" helpText="Variables: {name} · {shop}" />
          </BlockStack>
        </Modal.Section>

        {/* Template picker */}
        {showTemplates && (
          <Modal.Section>
            <BlockStack gap="300">
              <Text as="h3" variant="headingSm">Choose a template</Text>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px,1fr))", gap: 12 }}>
                {EMAIL_TEMPLATES.map((t: any) => (
                  <button key={t.id} onClick={() => applyTemplate(t.html, t.name)}
                    style={{ textAlign: "left", border: "1.5px solid #e1e3e5", borderRadius: 8, padding: 0, background: "#fff", cursor: "pointer", overflow: "hidden" }}>
                    <div style={{ height: CARD_H, overflow: "hidden", pointerEvents: "none", background: "#f6f6f7", position: "relative" }}>
                      <iframe srcDoc={t.html} title={t.name} scrolling="no" style={{ width: IFRAME_W, height: IFRAME_H, border: "none", transform: `scale(${SCALE})`, transformOrigin: "top left", pointerEvents: "none" }} />
                    </div>
                    <div style={{ padding: "8px 10px", borderTop: "2px solid " + (t.primaryColor || "#4f46e5") }}>
                      <Text as="p" variant="bodySm" fontWeight="semibold">{t.name}</Text>
                    </div>
                  </button>
                ))}
              </div>
            </BlockStack>
          </Modal.Section>
        )}

        {/* Email body — Unlayer drag-and-drop editor */}
        <Modal.Section>
          <BlockStack gap="300">
            <Text as="h3" variant="headingSm">Email body</Text>
            {!unlayerReady && (
              <Text as="p" variant="bodySm" tone="subdued">Loading email editor…</Text>
            )}
            <style dangerouslySetInnerHTML={{ __html: `
              #flow-unlayer-editor { overflow: hidden !important; }
              #flow-unlayer-editor iframe { border: none !important; }
              #flow-unlayer-editor > div > div:last-child { display: none !important; }
            `}} />
            <div
              id="flow-unlayer-editor"
              style={{
                height: 500,
                border: "1px solid #E5E7EB",
                borderRadius: 8,
                overflow: "hidden",
                background: "#f9fafb",
              }}
            />
          </BlockStack>
        </Modal.Section>
      </Modal>
    </Page>
  );
}
