// app/routes/app.newsletter.flows.$id_.steps.$stepId.tsx
// Edit one email in an automation flow: timing, subject and design (block editor).

import { json, type ActionFunctionArgs, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, useNavigate } from "@remix-run/react";
import {
  Banner,
  BlockStack,
  Box,
  Button,
  Card,
  FormLayout,
  InlineGrid,
  InlineStack,
  Modal,
  Page,
  Text,
  TextField,
} from "@shopify/polaris";
import { useCallback, useState } from "react";
import { authenticate } from "~/shopify.server";
import db from "~/db.server";
import { useAuthenticatedFetch } from "~/utils/useAuthenticatedFetch";
import { EmailEditor } from "~/components/email/EmailEditor";
import { isEmailDoc, renderEmail, type EmailDoc } from "~/email/blocks";
import { STARTER_TEMPLATES } from "~/email/templates";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const { session, admin } = await authenticate.admin(request);
  const anyDb = db as any;
  const step = await anyDb.automationStep.findFirst({
    where: { id: params.stepId, flowId: params.id, flow: { shop: session.shop } },
    include: { flow: { select: { id: true, name: true } } },
  });
  if (!step) throw new Response("Not found", { status: 404 });

  const { getStoreBrand } = await import("~/email/brand.server");
  const brand = await getStoreBrand(session.shop, admin);
  return json({ step, brand });
}

export async function action({ request, params }: ActionFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const anyDb = db as any;
  const body = await request.json().catch(() => ({}));

  const step = await anyDb.automationStep.findFirst({
    where: { id: params.stepId, flowId: params.id, flow: { shop: session.shop } },
  });
  if (!step) return json({ ok: false, error: "Step not found" }, { status: 404 });

  const doc = isEmailDoc(body.doc) ? (body.doc as EmailDoc) : null;
  await anyDb.automationStep.update({
    where: { id: step.id },
    data: {
      delayDays: Math.max(0, Number(body.delayDays) || 0),
      delayHours: Math.min(23, Math.max(0, Number(body.delayHours) || 0)),
      subject: String(body.subject ?? ""),
      ...(doc && { designJson: doc, htmlContent: renderEmail(doc) }),
    },
  });
  return json({ ok: true });
}

export default function FlowStepEditor() {
  const { step, brand } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const authFetch = useAuthenticatedFetch();

  const [doc, setDoc] = useState<EmailDoc | null>(isEmailDoc(step.designJson) ? (step.designJson as EmailDoc) : null);
  const [subject, setSubject] = useState(step.subject || "");
  const [delayDays, setDelayDays] = useState(String(step.delayDays ?? 0));
  const [delayHours, setDelayHours] = useState(String(step.delayHours ?? 0));
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [templateModal, setTemplateModal] = useState(false);
  const touch = <T,>(setter: (v: T) => void) => (v: T) => { setter(v); setDirty(true); };
  const backUrl = `/app/newsletter/flows/${step.flow.id}`;

  const save = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await authFetch(`/app/newsletter/flows/${step.flow.id}/steps/${step.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ subject, delayDays, delayHours, doc }),
      });
      const result = await res.json().catch(() => ({ ok: false }));
      if (!result.ok) throw new Error(result.error || "Save failed");
      setDirty(false);
      (window as any).shopify?.toast?.show?.("Email saved");
    } catch (e: any) {
      setError(e?.message || "Save failed");
    } finally {
      setSaving(false);
    }
  }, [authFetch, step.flow.id, step.id, subject, delayDays, delayHours, doc]);

  const uploadImage = useCallback(async (file: File) => {
    const form = new FormData();
    form.append("file", file);
    try {
      const res = await authFetch("/api/newsletter/image-upload", { method: "POST", body: form });
      return ((await res.json())?.url as string) || null;
    } catch {
      return null;
    }
  }, [authFetch]);

  return (
    <Page
      fullWidth
      title={subject || "Flow email"}
      subtitle={step.flow.name}
      backAction={{ content: step.flow.name, onAction: () => navigate(backUrl) }}
      primaryAction={{ content: dirty ? "Save" : "Saved", onAction: save, loading: saving, disabled: !dirty }}
      secondaryActions={[{ content: "Start from a template", onAction: () => setTemplateModal(true) }]}
    >
      <BlockStack gap="400">
        {error && <Banner tone="critical" onDismiss={() => setError(null)}>{error}</Banner>}

        <Card>
          <FormLayout>
            <FormLayout.Group condensed>
              <TextField label="Wait (days)" type="number" min={0} value={delayDays} onChange={touch(setDelayDays)} autoComplete="off" />
              <TextField label="Wait (hours)" type="number" min={0} max={23} value={delayHours} onChange={touch(setDelayHours)} autoComplete="off" />
            </FormLayout.Group>
            <TextField label="Subject line" value={subject} onChange={touch(setSubject)} autoComplete="off" helpText="{{first_name}} inserts the subscriber's first name." />
          </FormLayout>
        </Card>

        {doc ? (
          <EmailEditor doc={doc} onChange={(d) => { setDoc(d); setDirty(true); }} brand={brand} uploadImage={uploadImage} />
        ) : (
          <BlockStack gap="400">
            <Banner
              tone="info"
              title={step.htmlContent ? "This email was made with the old editor" : "This email has no content yet"}
              action={{ content: "Choose a template", onAction: () => setTemplateModal(true) }}
            >
              {step.htmlContent ? "It keeps sending as it is. To change it, start from a template — this replaces the current content." : "Pick a template to start designing."}
            </Banner>
            {step.htmlContent && (
              <Card padding="0">
                <iframe title="Email preview" srcDoc={step.htmlContent} sandbox="" style={{ width: "100%", height: 640, border: 0, display: "block" }} />
              </Card>
            )}
          </BlockStack>
        )}
      </BlockStack>

      <Modal open={templateModal} onClose={() => setTemplateModal(false)} title="Start from a template" size="large">
        <Modal.Section>
          <BlockStack gap="300">
            {doc && <Banner tone="warning">This replaces your current design.</Banner>}
            <InlineGrid columns={{ xs: 1, sm: 2 }} gap="300">
              {STARTER_TEMPLATES.map((t) => (
                <Card key={t.id}>
                  <BlockStack gap="200">
                    <Text as="h3" variant="headingSm">{t.name}</Text>
                    <Text as="p" tone="subdued">{t.description}</Text>
                    <InlineStack>
                      <Button
                        onClick={() => {
                          setDoc(t.build(brand));
                          if (!subject && t.subject) setSubject(t.subject);
                          setDirty(true);
                          setTemplateModal(false);
                        }}
                      >
                        Use this template
                      </Button>
                    </InlineStack>
                  </BlockStack>
                </Card>
              ))}
            </InlineGrid>
          </BlockStack>
        </Modal.Section>
      </Modal>
      <Box paddingBlockEnd="800" />
    </Page>
  );
}
