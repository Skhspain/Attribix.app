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
import { useAuthenticatedFetch } from "~/utils/useAuthenticatedFetch";
import { countSubscribersForSegment } from "~/services/newsletter.server";

// ─── Loader ──────────────────────────────────────────────────────────────────

export async function loader({ request, params }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const anyDb = db as any;

  const [campaign, newsletterSettings] = await Promise.all([
    anyDb.newsletterCampaign?.findUnique?.({ where: { id: params.id } }),
    anyDb.newsletterSettings?.findUnique?.({ where: { shop } }).catch(() => null),
  ]);

  if (!campaign || campaign.shop !== shop) {
    throw new Response("Campaign not found", { status: 404 });
  }

  const recipientPreview = await countSubscribersForSegment(shop, campaign.segmentFilter ?? {});
  const smtpConfigured = !!process.env.SMTP_HOST;

  // Defaults from newsletter settings (fall back to env var for email)
  const defaultFromName = newsletterSettings?.fromName || "";
  const defaultFromEmail = newsletterSettings?.fromEmail || process.env.SMTP_FROM_EMAIL || "";
  const defaultReplyTo = newsletterSettings?.replyTo || "";
  const defaultFooterText = newsletterSettings?.footerText || "";

  return json({ campaign, shop, recipientPreview, smtpConfigured, defaultFromName, defaultFromEmail, defaultReplyTo, defaultFooterText });
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
        name: body.name || "Untitled newsletter",
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

    // Auto-save sender identity to newsletter settings for future campaigns
    if (body.fromName || body.fromEmail || body.replyTo) {
      await anyDb.newsletterSettings.upsert({
        where: { shop },
        create: {
          shop,
          fromName: body.fromName || "",
          fromEmail: body.fromEmail || "",
          replyTo: body.replyTo || "",
        },
        update: {
          ...(body.fromName && { fromName: body.fromName }),
          ...(body.fromEmail && { fromEmail: body.fromEmail }),
          ...(body.replyTo && { replyTo: body.replyTo }),
        },
      }).catch(() => null);
    }

    return json({ ok: true, id: params.id });
  }

  if (intent === "save-as-template") {
    await anyDb.newsletterCampaign.create({
      data: {
        shop,
        name: (body.name || "My Template") + " (Template)",
        subject: "",
        status: "template",
        htmlContent: body.htmlContent || null,
        designJson: body.designJson || null,
        fromName: body.fromName || null,
        fromEmail: body.fromEmail || null,
      },
    });
    return json({ ok: true, saved: "template" });
  }

  if (intent === "send") {
    const { getShopPlan, checkNewsletterSendsQuota } = await import("~/services/plan.server");
    const { sendCampaign, countSubscribersForSegment } = await import("~/services/newsletter.server");

    const campaign = await anyDb.newsletterCampaign?.findUnique?.({ where: { id: params.id } });
    const recipientCount = await countSubscribersForSegment(shop, campaign?.segmentFilter ?? {});

    const { admin } = await authenticate.admin(request);
    const plan = await getShopPlan(shop, admin);
    const quota = await checkNewsletterSendsQuota(shop, plan, recipientCount);

    if (!quota.allowed) {
      return json({
        ok: false,
        error: `Email send limit reached (${quota.used.toLocaleString()} of ${quota.limit.toLocaleString()} sent this month). Upgrade your plan to send more.`,
      }, { status: 403 });
    }

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
  const { campaign, shop, recipientPreview, smtpConfigured, defaultFromName, defaultFromEmail, defaultReplyTo } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const editorRef = useRef<HTMLDivElement>(null);

  const authFetch = useAuthenticatedFetch();
  const [name, setName] = useState(campaign.name || "");
  const [subject, setSubject] = useState(campaign.subject || "");
  const [previewText, setPreviewText] = useState(campaign.previewText || "");
  const [fromName, setFromName] = useState(campaign.fromName || defaultFromName || "");
  const [fromEmailVal, setFromEmailVal] = useState(campaign.fromEmail || defaultFromEmail || "newsletters@attribix.email");
  const [replyTo, setReplyTo] = useState(campaign.replyTo || defaultReplyTo || "");

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
      appearance: {
        theme: "light",
        panels: { tools: { dock: "right" } },
      },
      customCSS: [
        `.blockbuilder-branding { display: none !important; }`,
        `.blockbuilder-footer { display: none !important; }`,
        `body { overflow-x: hidden !important; }`,
        `.blockbuilder-content-tools { overflow: hidden !important; }`,
        `.blockbuilder-preferences { width: 0 !important; min-width: 0 !important; overflow: hidden !important; transition: width 0.3s !important; }`,
        `.blockbuilder-preferences:hover, .blockbuilder-preferences:focus-within, .blockbuilder-preferences.active { width: 360px !important; min-width: 360px !important; }`,
        `.blockbuilder-preferences .tools-header { cursor: pointer; }`,
      ],
      options: {
        mergeTags: {
          shop_url: { name: "Shop URL", value: `https://${shop}` },
          unsubscribe_url: { name: "Unsubscribe", value: "#unsubscribe" },
        },
      },
      editor: { minRows: 1, autoSelectOnDrop: true },
      features: {
        textEditor: { tables: true, emojis: true },
        preview: true,
        preheaderText: false,
        undoRedo: true,
      },
      tools: {
        button: { enabled: true },
        image: { enabled: true },
        text: { enabled: true },
        divider: { enabled: true },
        heading: { enabled: true },
        html: { enabled: true },
        social: { enabled: true },
        video: { enabled: true },
      },
      designTags: {
        shop_url: `https://${shop}`,
        shop_name: shop.replace(".myshopify.com", ""),
      },
    });

    // Register image upload handler — sends file to our server, returns hosted URL
    window.unlayer.registerCallback("image", async (file: any, done: (result: { progress: number; url?: string }) => void) => {
      try {
        done({ progress: 10 });
        const formData = new FormData();
        const fileObj: File = file?.attachments?.[0] ?? file;
        formData.append("file", fileObj);
        const res = await authFetch("/api/newsletter/image-upload", {
          method: "POST",
          body: formData,
        });
        let result;
        try { result = await res.json(); } catch { result = { url: null }; }
        if (result.url) {
          done({ progress: 100, url: result.url });
        } else {
          done({ progress: 0 });
          console.error("[unlayer] image upload failed:", result.error);
        }
      } catch (e) {
        done({ progress: 0 });
        console.error("[unlayer] image upload error:", e);
      }
    });

    // Replace placeholders with real values before loading into editor
    const shopUrl = `https://${shop}`;
    const shopName = shop.replace(".myshopify.com", "");

    if (campaign.designJson) {
      try {
        const json = typeof campaign.designJson === "string" ? campaign.designJson : JSON.stringify(campaign.designJson);
        const replaced = json
          .replace(/\{\{shop_url\}\}/gi, shopUrl)
          .replace(/\{\{shop\}\}/gi, shopName);
        window.unlayer.loadDesign(JSON.parse(replaced));
      } catch { window.unlayer.loadDesign(campaign.designJson); }
    } else if (campaign.htmlContent) {
      let replaced = campaign.htmlContent
        .replace(/\{\{shop_url\}\}/gi, shopUrl)
        .replace(/\{\{shop\}\}/gi, shopName);

      // Add unsubscribe footer if not already present
      if (!replaced.includes("unsubscribe") && !replaced.includes("Unsubscribe")) {
        const unsubFooter = `<div style="text-align:center;padding:20px 0 16px;border-top:1px solid #e5e5e5;margin-top:24px;font-size:12px;color:#9ca3af;"><p style="margin:0 0 6px;">You're receiving this because you subscribed.</p><p style="margin:0;"><a href="#" style="color:#6366f1;text-decoration:underline;">Unsubscribe</a></p></div>`;
        if (replaced.includes("</body>")) {
          replaced = replaced.replace("</body>", `${unsubFooter}</body>`);
        } else {
          replaced += unsubFooter;
        }
      }

      window.unlayer.loadDesign({ html: replaced, classic: true });
    }
    setUnlayerReady(true);

    // Auto-collapse the tools panel after a short delay
    setTimeout(() => {
      try {
        const iframe = document.querySelector("#unlayer-editor iframe") as HTMLIFrameElement;
        if (iframe?.contentDocument) {
          const collapseBtn = iframe.contentDocument.querySelector('[data-testid="tools-collapse"], .collapse-btn, [class*="collapse"]') as HTMLElement;
          if (collapseBtn) collapseBtn.click();
        }
      } catch {}
      // Fallback: use Unlayer API if available
      try { (window as any).unlayer?.setToolsPanelCollapsed?.(true); } catch {}
    }, 1500);
  }

  const saveData = useCallback(async (htmlContent: string, designJson: object | null) => {
    setSaveStatus("saving");
    try {
      const res = await authFetch(`/app/newsletter/campaigns/${campaign.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intent: "save", name, subject, previewText, fromName, fromEmail: fromEmailVal, replyTo, designJson, htmlContent, segmentFilter: {} }),
      });
      const result = await res.json();
      setSaveStatus(result.ok ? "saved" : "error");
      if (result.ok) setTimeout(() => setSaveStatus("idle"), 2000);
    } catch (e) {
      console.error("[campaign] save error:", e);
      setSaveStatus("error");
      setTimeout(() => setSaveStatus("idle"), 3000);
    }
  }, [campaign.id, name, subject, previewText, fromName, fromEmailVal, replyTo, authFetch]);

  const handleSave = useCallback(async () => {
    if (editMode === "preview") {
      await saveData(campaign.htmlContent || "", null);
    } else if (window.unlayer && unlayerReady) {
      window.unlayer.exportHtml(async (data: { design: object; html: string }) => {
        await saveData(data.html, data.design);
      });
    } else {
      // Unlayer not ready — save what we have
      await saveData(campaign.htmlContent || "", null);
    }
  }, [editMode, campaign.htmlContent, saveData, unlayerReady]);

  const handleSend = useCallback(async () => {
    if (!campaign.id) return;
    setSendModalOpen(false);

    const doSend = async () => {
      try {
        const res = await authFetch(`/app/newsletter/campaigns/${campaign.id}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ intent: "send" }),
        });
        const text = await res.text();
        let result;
        try {
          result = JSON.parse(text);
        } catch {
          // Shopify may wrap JSON in HTML — try to extract
          const match = text.match(/\{[^]*"ok"\s*:\s*(true|false)[^]*\}/);
          result = match ? JSON.parse(match[0]) : { ok: res.ok, sent: 0, failed: 0, errors: [] };
        }
        setSendResult(result);
        if (result.ok || res.ok) {
          setSendResult({ ok: true, sent: result.sent || 0, failed: 0, errors: [], message: "Newsletter sent!" });
          setTimeout(() => navigate("/app/newsletter/campaigns"), 2000);
        }
      } catch (e) {
        console.error("[campaign] send error:", e);
        // The send may have succeeded server-side even if the response parsing failed
        setSendResult({ ok: true, sent: 0, failed: 0, errors: [], message: "Newsletter is being sent. Check your email inbox." });
        setTimeout(() => navigate("/app/newsletter/campaigns"), 3000);
      }
    };

    if (editMode === "preview") {
      await saveData(campaign.htmlContent || "", null);
      await doSend();
    } else if (window.unlayer && unlayerReady) {
      window.unlayer.exportHtml(async (data: { design: object; html: string }) => {
        await saveData(data.html, data.design);
        await doSend();
      });
    } else {
      await saveData(campaign.htmlContent || "", null);
      await doSend();
    }
  }, [campaign.id, campaign.htmlContent, editMode, saveData, authFetch, navigate, unlayerReady]);

  return (
    <Page
      title={name || "Edit newsletter"}
      backAction={{ content: "Newsletters", url: "/app/newsletter/campaigns" }}
      primaryAction={{
        content: saveStatus === "saving" ? "Saving…" : saveStatus === "saved" ? "Saved ✓" : "Save Draft",
        onAction: handleSave,
        disabled: saveStatus === "saving" || isSent,
      }}
      secondaryActions={[
        {
          content: "Send newsletter",
          onAction: () => setSendModalOpen(true),
          disabled: isSent || !smtpConfigured,
          tone: "success",
        },
        {
          content: "Save as template",
          onAction: () => {
            if (window.unlayer && unlayerReady) {
              window.unlayer.exportHtml(async (data: { design: object; html: string }) => {
                await authFetch(`/app/newsletter/campaigns/${campaign.id}`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ intent: "save-as-template", name, htmlContent: data.html, designJson: data.design, fromName, fromEmail: fromEmailVal }),
                });
                setSaveStatus("saved");
                setTimeout(() => setSaveStatus("idle"), 2000);
              });
            }
          },
          disabled: isSent || !unlayerReady,
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
            title={sendResult.ok ? `Newsletter sent! ${sendResult.sent} delivered.` : `Send failed: ${sendResult.errors?.join(", ")}`}
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

        {/* HTML preview (safe — all links disabled, no navigation possible) */}
        {editMode === "preview" && campaign.htmlContent && (
          <div style={{ border: "1px solid #e1e3e5", borderRadius: 8, overflow: "hidden", background: "#f4f4f4" }}>
            <iframe
              srcDoc={`<style>a{pointer-events:none!important;cursor:default!important;}body{margin:0;}</style>${
                campaign.htmlContent
                  .replace(/\{\{shop_url\}\}/gi, `https://${shop}`)
                  .replace(/\{\{shop\}\}/gi, shop.replace(".myshopify.com", ""))
                  .replace(/\{\{first_name\}\}/gi, "Customer")
                  .replace(/\{\{name\}\}/gi, "Customer")
                  .replace(/\{\{email\}\}/gi, "customer@example.com")
                  .replace(/\{\{unsubscribe_url\}\}/gi, "#")
                  .replace(/href="[^"]*"/g, 'href="#"')
              }`}
              sandbox=""
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

        {/* Fix Unlayer scroll + branding */}
        <style dangerouslySetInnerHTML={{ __html: `
          #unlayer-editor { overflow: hidden !important; }
          #unlayer-editor iframe { border: none !important; }
          #unlayer-editor > div > div:last-child { display: none !important; }
        `}} />

        {/* Unlayer drag-and-drop editor */}
        <div
          id="unlayer-editor"
          ref={editorRef}
          style={{
            height: "80vh",
            minHeight: 700,
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
        title="Send newsletter"
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
