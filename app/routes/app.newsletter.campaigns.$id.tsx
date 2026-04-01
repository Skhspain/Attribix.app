// app/routes/app.newsletter.campaigns.$id.tsx
// Step 2 of 2: Campaign editor — edit details, preview/edit HTML, send.
// Reached after template selection in app.newsletter.campaigns.new.tsx

import {
  json,
  type LoaderFunctionArgs,
  type ActionFunctionArgs,
} from "@remix-run/node";
import { useLoaderData, useNavigate } from "@remix-run/react";
import { authenticate } from "~/shopify.server";
import db from "~/db.server";
import {
  Page,
  Card,
  BlockStack,
  InlineStack,
  Text,
  TextField,
  Button,
  Badge,
  Banner,
  Modal,
} from "@shopify/polaris";
import { useState, useRef, useEffect, useCallback } from "react";
import { countSubscribersForSegment } from "~/services/newsletter.server";

// ─── Loader ──────────────────────────────────────────────────────────────────

export async function loader({ request, params }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const anyDb = db as any;

  const campaign = await anyDb.newsletterCampaign?.findUnique?.({
    where: { id: params.id },
  });

  if (!campaign || campaign.shop !== shop) {
    throw new Response("Campaign not found", { status: 404 });
  }

  const recipientPreview = await countSubscribersForSegment(shop, campaign.segmentFilter ?? {});
  const smtpConfigured = !!process.env.SMTP_HOST;
  const fromEmail = process.env.SMTP_FROM_EMAIL || "";

  return json({ campaign, shop, recipientPreview, smtpConfigured, fromEmail });
}

// ─── Action ──────────────────────────────────────────────────────────────────

export async function action({ request, params }: ActionFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const anyDb = db as any;
  const body = await request.json().catch(() => ({}));
  const intent = body?.intent as string;

  if (intent === "save") {
    await anyDb.newsletterCampaign.update({
      where: { id: params.id },
      data: {
        shop,
        name: body.name || "Untitled campaign",
        subject: body.subject || "",
        previewText: body.previewText || null,
        fromName: body.fromName || null,
        fromEmail: body.fromEmail || null,
        replyTo: body.replyTo || null,
        designJson: body.designJson || null,
        htmlContent: body.htmlContent || null,
        segmentFilter: body.segmentFilter || null,
        status: "draft",
      },
    });
    return json({ ok: true, id: params.id });
  }

  if (intent === "send") {
    const { sendCampaign } = await import("~/services/newsletter.server");
    const result = await sendCampaign(params.id!);
    return json(result);
  }

  return json({ ok: false, error: "Unknown intent" }, { status: 400 });
}

// ─── Component ───────────────────────────────────────────────────────────────

declare global {
  interface Window { unlayer?: any; }
}

export default function CampaignEditor() {
  const { campaign, recipientPreview, smtpConfigured, fromEmail } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const editorRef = useRef<HTMLDivElement>(null);

  const [name, setName] = useState(campaign.name || "");
  const [subject, setSubject] = useState(campaign.subject || "");
  const [previewText, setPreviewText] = useState(campaign.previewText || "");
  const [fromName, setFromName] = useState(campaign.fromName || "Attribix");
  const [fromEmailVal, setFromEmailVal] = useState(campaign.fromEmail || fromEmail);
  const [replyTo, setReplyTo] = useState(campaign.replyTo || "");

  // editMode: "preview" (shows iframe of HTML) or "unlayer" (drag-and-drop)
  const hasDesignJson = !!campaign.designJson;
  const [editMode, setEditMode] = useState<"preview" | "unlayer">(hasDesignJson ? "unlayer" : "preview");
  const [unlayerReady, setUnlayerReady] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [sendModalOpen, setSendModalOpen] = useState(false);
  const [sendResult, setSendResult] = useState<any>(null);
  const isSent = campaign.status === "sent" || campaign.status === "sending";

  // Load Unlayer only when in unlayer mode
  useEffect(() => {
    if (editMode !== "unlayer") return;
    if (typeof window === "undefined") return;
    if (window.unlayer) { initUnlayer(); return; }

    const script = document.createElement("script");
    script.src = "https://editor.unlayer.com/embed.js";
    script.async = true;
    script.onload = () => initUnlayer();
    document.head.appendChild(script);
  }, [editMode]);

  function initUnlayer() {
    if (!editorRef.current || !window.unlayer) return;
    window.unlayer.init({
      id: "unlayer-editor",
      displayMode: "email",
      locale: "en-US",
      appearance: { theme: "light", panels: { tools: { dock: "right" } } },
      features: { textEditor: { tables: true, emojis: true } },
    });
    if (campaign.designJson) {
      window.unlayer.loadDesign(campaign.designJson);
    } else if (campaign.htmlContent) {
      // Load existing HTML into unlayer
      window.unlayer.loadDesign({ html: campaign.htmlContent, classic: true });
    }
    setUnlayerReady(true);
  }

  const saveData = useCallback(async (htmlContent: string, designJson: object | null) => {
    setSaveStatus("saving");
    const res = await fetch(`/app/newsletter/campaigns/${campaign.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ intent: "save", name, subject, previewText, fromName, fromEmail: fromEmailVal, replyTo, designJson, htmlContent, segmentFilter: {} }),
    });
    const result = await res.json();
    setSaveStatus(result.ok ? "saved" : "error");
    if (result.ok) setTimeout(() => setSaveStatus("idle"), 2000);
  }, [campaign.id, name, subject, previewText, fromName, fromEmailVal, replyTo]);

  const handleSave = useCallback(async () => {
    if (editMode === "preview") {
      await saveData(campaign.htmlContent || "", null);
    } else if (window.unlayer) {
      window.unlayer.exportHtml(async (data: { design: object; html: string }) => {
        await saveData(data.html, data.design);
      });
    }
  }, [editMode, campaign.htmlContent, saveData]);

  const handleSend = useCallback(async () => {
    if (!campaign.id) return;
    const doSend = async () => {
      const res = await fetch(`/app/newsletter/campaigns/${campaign.id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ intent: "send" }) });
      setSendResult(await res.json());
    };
    if (editMode === "preview") {
      await saveData(campaign.htmlContent || "", null);
      await doSend();
    } else if (window.unlayer) {
      window.unlayer.exportHtml(async (data: { design: object; html: string }) => {
        await saveData(data.html, data.design);
        await doSend();
      });
    }
  }, [campaign.id, campaign.htmlContent, editMode, saveData]);

  return (
    <Page
      title={name || "Edit campaign"}
      backAction={{ content: "Campaigns", url: "/app/newsletter/campaigns" }}
      primaryAction={{
        content: saveStatus === "saving" ? "Saving…" : saveStatus === "saved" ? "Saved ✓" : "Save",
        onAction: handleSave,
        disabled: saveStatus === "saving" || isSent,
      }}
      secondaryActions={[
        {
          content: "Send campaign",
          onAction: () => setSendModalOpen(true),
          disabled: isSent || !smtpConfigured,
          tone: "success",
        },
      ]}
    >
      <BlockStack gap="500">
        {!smtpConfigured && (
          <Banner tone="warning" title="Sending not configured">
            Add SMTP_HOST and SMTP_USER to your Fly.io secrets to enable sending.
          </Banner>
        )}

        {sendResult && (
          <Banner
            tone={sendResult.ok ? "success" : "critical"}
            title={sendResult.ok ? `Campaign sent! ${sendResult.sent} delivered.` : `Send failed: ${sendResult.errors?.join(", ")}`}
            onDismiss={() => setSendResult(null)}
          />
        )}

        {/* Campaign details */}
        <Card>
          <BlockStack gap="400">
            <Text as="h2" variant="headingSm">Campaign details</Text>
            <InlineStack gap="400" wrap>
              <div style={{ flex: 1, minWidth: 200 }}>
                <TextField label="Campaign name (internal)" value={name} onChange={setName} autoComplete="off" disabled={isSent} />
              </div>
              <div style={{ flex: 1, minWidth: 200 }}>
                <TextField label="Email subject" value={subject} onChange={setSubject} autoComplete="off" disabled={isSent} helpText="Appears as the subject line in the inbox" />
              </div>
            </InlineStack>
            <InlineStack gap="400" wrap>
              <div style={{ flex: 1, minWidth: 200 }}>
                <TextField label="Preview text" value={previewText} onChange={setPreviewText} autoComplete="off" disabled={isSent} helpText="Shown after the subject in some email clients" />
              </div>
              <div style={{ flex: 1, minWidth: 200 }}>
                <TextField label="From name" value={fromName} onChange={setFromName} autoComplete="off" disabled={isSent} />
              </div>
            </InlineStack>
            <InlineStack gap="400" wrap>
              <div style={{ flex: 1, minWidth: 200 }}>
                <TextField label="From email" value={fromEmailVal} onChange={setFromEmailVal} autoComplete="email" type="email" disabled={isSent} helpText="Must be a verified sending domain" />
              </div>
              <div style={{ flex: 1, minWidth: 200 }}>
                <TextField label="Reply-to (optional)" value={replyTo} onChange={setReplyTo} autoComplete="email" type="email" disabled={isSent} />
              </div>
            </InlineStack>
          </BlockStack>
        </Card>

        {/* Recipients */}
        <Card>
          <InlineStack align="space-between" blockAlign="center">
            <BlockStack gap="050">
              <Text as="h2" variant="headingSm">Recipients</Text>
              <Text as="p" variant="bodySm" tone="subdued">Sending to all active subscribers</Text>
            </BlockStack>
            <Badge tone="info">{recipientPreview.toLocaleString()} subscribers</Badge>
          </InlineStack>
        </Card>

        {/* Design editor */}
        {!isSent && (
          <Card>
            <InlineStack align="space-between" blockAlign="center">
              <Text as="h2" variant="headingSm">Email design</Text>
              <InlineStack gap="200">
                <Button url="/app/newsletter/campaigns/new" variant="secondary">Change template</Button>
                {editMode === "preview" && (
                  <Button onClick={() => setEditMode("unlayer")} variant="plain">Open in editor</Button>
                )}
                {editMode === "unlayer" && campaign.htmlContent && (
                  <Button onClick={() => setEditMode("preview")} variant="plain">Preview only</Button>
                )}
              </InlineStack>
            </InlineStack>
          </Card>
        )}

        {/* HTML preview (iframe) */}
        {editMode === "preview" && campaign.htmlContent && (
          <div style={{ border: "1px solid #e1e3e5", borderRadius: 8, overflow: "hidden", background: "#f4f4f4" }}>
            <iframe
              srcDoc={campaign.htmlContent}
              style={{ width: "100%", height: 640, border: "none", display: "block" }}
              title="Email preview"
            />
          </div>
        )}

        {editMode === "preview" && !campaign.htmlContent && (
          <Card>
            <div style={{ padding: 40, textAlign: "center", color: "#9ca3af" }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>✉️</div>
              <Text as="p" variant="bodyMd" tone="subdued">No content yet. Click "Open in editor" to design your email.</Text>
            </div>
          </Card>
        )}

        {/* Unlayer drag-and-drop editor */}
        <div
          id="unlayer-editor"
          ref={editorRef}
          style={{
            width: "100%",
            height: 720,
            border: "1px solid #e1e3e5",
            borderRadius: 8,
            overflow: "hidden",
            display: editMode === "unlayer" && !isSent ? "block" : "none",
          }}
        />

        {/* Sent preview */}
        {isSent && campaign.htmlContent && (
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingSm">Email preview (sent)</Text>
              <div style={{ border: "1px solid #e1e3e5", borderRadius: 8, overflow: "hidden" }}>
                <iframe srcDoc={campaign.htmlContent} style={{ width: "100%", height: 600, border: "none", display: "block" }} title="Sent email" />
              </div>
            </BlockStack>
          </Card>
        )}
      </BlockStack>

      {/* Send confirmation */}
      <Modal
        open={sendModalOpen}
        onClose={() => setSendModalOpen(false)}
        title="Send campaign"
        primaryAction={{
          content: `Send to ${recipientPreview.toLocaleString()} subscribers`,
          onAction: () => { setSendModalOpen(false); handleSend(); },
          tone: "success",
        }}
        secondaryActions={[{ content: "Cancel", onAction: () => setSendModalOpen(false) }]}
      >
        <Modal.Section>
          <BlockStack gap="300">
            <Text as="p">You're about to send <strong>{subject || "(no subject)"}</strong> to <strong>{recipientPreview.toLocaleString()} subscribers</strong>.</Text>
            <Text as="p" tone="subdued">This action cannot be undone. Make sure your email looks correct before sending.</Text>
          </BlockStack>
        </Modal.Section>
      </Modal>
    </Page>
  );
}
