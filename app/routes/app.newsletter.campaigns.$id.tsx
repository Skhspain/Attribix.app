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

  // HMAC token used by the /api/newsletter/test-send endpoint so the client
  // can send a test email without needing a live Shopify session token.
  const { createHmac } = await import("node:crypto");
  const testSendToken = createHmac("sha256", process.env.SHOPIFY_API_SECRET ?? "fallback")
    .update(`${shop}:${params.id}`)
    .digest("hex")
    .slice(0, 32);

  // Defaults from newsletter settings (fall back to env var for email)
  const defaultFromName = newsletterSettings?.fromName || "";
  const defaultFromEmail = newsletterSettings?.fromEmail || process.env.SMTP_FROM_EMAIL || "";
  const defaultReplyTo = newsletterSettings?.replyTo || "";
  const defaultFooterText = newsletterSettings?.footerText || "";

  return json({ campaign, shop, recipientPreview, smtpConfigured, testSendToken, defaultFromName, defaultFromEmail, defaultReplyTo, defaultFooterText });
}

// ─── Action ──────────────────────────────────────────────────────────────────

export async function action({ request, params }: ActionFunctionArgs) {
  // With unstable_newEmbeddedAuthStrategy the adapter throws a redirect Response
  // when the Bearer token is missing/invalid. Catch it so AJAX callers get JSON
  // instead of an HTML page that the client can't parse.
  let session: any;
  let admin: any;
  try {
    ({ session, admin } = await authenticate.admin(request));
  } catch (e: any) {
    if (
      e instanceof Response &&
      (request.headers.get("content-type")?.includes("application/json") ||
        request.headers.get("accept")?.includes("application/json"))
    ) {
      return json(
        { ok: false, error: "Session expired — please refresh the page and try again" },
        { status: 401 },
      );
    }
    throw e;
  }
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
    const testMode = !!(body as any).testMode;
    const testEmail = ((body as any).testEmail as string | undefined)?.trim();

    if (testMode && testEmail) {
      if (!process.env.SMTP_HOST) {
        return json({ ok: false, error: "Email sending is not configured (SMTP_HOST missing). Contact support to enable sending." });
      }
      const { sendEmail } = await import("~/services/resend.server");
      const campaign = await anyDb.newsletterCampaign?.findUnique?.({ where: { id: params.id } });
      if (!campaign?.htmlContent) {
        return json({ ok: false, error: "No email content yet — design your email first, then send a test." });
      }
      const fromName = campaign.fromName || "Newsletter";
      const fromEmail = campaign.fromEmail || process.env.SMTP_FROM_EMAIL || "";
      if (!fromEmail) {
        return json({ ok: false, error: "Sender email not configured. Go to Newsletter → Settings and set a From email address first." });
      }
      const shopDomain = shop.replace(".myshopify.com", "");
      const html = campaign.htmlContent
        .replace(/\{\{first_name\}\}/gi, "Test Subscriber")
        .replace(/\{\{name\}\}/gi, "Test Subscriber")
        .replace(/\{\{email\}\}/gi, testEmail)
        .replace(/\{\{shop_url\}\}/gi, `https://${shop}`)
        .replace(/\{\{shop\}\}/gi, shopDomain)
        .replace(/\{\{unsubscribe_url\}\}/gi, "#");
      const result = await sendEmail({
        from: `${fromName} <${fromEmail}>`,
        to: testEmail,
        subject: `[TEST] ${campaign.subject || "(no subject)"}`,
        html,
        replyTo: campaign.replyTo || undefined,
      });
      return json(result.ok
        ? { ok: true, message: `Test email sent to ${testEmail}` }
        : { ok: false, error: `Send failed: ${(result as any).error}` });
    }

    const { getShopPlan, checkNewsletterSendsQuota } = await import("~/services/plan.server");
    const { sendCampaign, countSubscribersForSegment } = await import("~/services/newsletter.server");

    const campaign = await anyDb.newsletterCampaign?.findUnique?.({ where: { id: params.id } });

    if (!campaign?.subject?.trim()) {
      return json({ ok: false, error: "Cannot send: subject line is missing. Go to the Settings tab and add a subject first." }, { status: 400 });
    }

    const recipientCount = await countSubscribersForSegment(shop, campaign?.segmentFilter ?? {});

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

type BuilderTab = "edit" | "settings" | "recipients" | "send";
type DevicePreview = "desktop" | "tablet" | "mobile";

export default function CampaignEditor() {
  const { campaign, shop, recipientPreview, smtpConfigured, testSendToken, defaultFromName, defaultFromEmail, defaultReplyTo } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const editorRef = useRef<HTMLDivElement>(null);

  const authFetch = useAuthenticatedFetch();
  const [name, setName] = useState(campaign.name || "");
  const [subject, setSubject] = useState(campaign.subject || "");
  const [previewText, setPreviewText] = useState(campaign.previewText || "");
  const [fromName, setFromName] = useState(campaign.fromName || defaultFromName || "");
  const [fromEmailVal, setFromEmailVal] = useState(campaign.fromEmail || defaultFromEmail || "newsletters@attribix.email");
  const [replyTo, setReplyTo] = useState(campaign.replyTo || defaultReplyTo || "");

  const hasDesignJson = !!campaign.designJson;
  const [editMode, setEditMode] = useState<"preview" | "unlayer">(hasDesignJson ? "unlayer" : "preview");
  const [unlayerReady, setUnlayerReady] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [sendModalOpen, setSendModalOpen] = useState(false);
  const [sendResult, setSendResult] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<BuilderTab>("edit");
  const [device, setDevice] = useState<DevicePreview>("desktop");
  const [testEmail, setTestEmail] = useState("");
  const [testModalOpen, setTestModalOpen] = useState(false);
  const [testSending, setTestSending] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message?: string } | null>(null);
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
      // exportHtml is callback-based — wrap in a Promise so callers can
      // await the full save before navigating away.
      await new Promise<void>((resolve) => {
        window.unlayer.exportHtml(async (data: { design: object; html: string }) => {
          await saveData(data.html, data.design);
          resolve();
        });
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
      await new Promise<void>((resolve) => {
        window.unlayer.exportHtml(async (data: { design: object; html: string }) => {
          await saveData(data.html, data.design);
          await doSend();
          resolve();
        });
      });
    } else {
      await saveData(campaign.htmlContent || "", null);
      await doSend();
    }
  }, [campaign.id, campaign.htmlContent, editMode, saveData, authFetch, navigate, unlayerReady]);

  const handleTestSend = useCallback(async () => {
    if (!testEmail) return;
    setTestSending(true);
    try {
      // Use a dedicated HMAC-authenticated endpoint so this call never goes
      // through the Shopify session-token flow — that was causing "session
      // expired" errors before the request even reached the server.
      const res = await fetch("/api/newsletter/test-send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaignId: campaign.id,
          shop,
          token: testSendToken,
          testEmail,
        }),
      });
      const result = await res.json().catch(() => ({
        ok: false,
        error: `Server error (HTTP ${res.status}) — check Fly.io logs`,
      }));
      setTestResult({
        ok: result.ok ?? false,
        message: result.ok
          ? (result.message ?? `Test sent to ${testEmail}`)
          : (result.error ?? "Send failed — check your SMTP configuration in Fly.io secrets"),
      });
    } catch {
      setTestResult({ ok: false, message: "Network error — could not reach server" });
    } finally {
      setTestSending(false);
    }
  }, [testEmail, campaign.id, shop, testSendToken]);

  const STEPS: { key: BuilderTab; label: string }[] = [
    { key: "edit", label: "Edit" },
    { key: "settings", label: "Settings" },
    { key: "recipients", label: "Recipients" },
    { key: "send", label: "Send" },
  ];

  const previewWidth = device === "mobile" ? 375 : device === "tablet" ? 768 : undefined;

  return (
    <Page fullWidth>
      <BlockStack gap="0">

        {/* ── Custom header ─────────────────────────────────────── */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "12px 0 16px", gap: 16, borderBottom: "1px solid #E5E7EB", marginBottom: 0,
        }}>
          <InlineStack gap="300" blockAlign="center">
            <button onClick={() => navigate("/app/newsletter/campaigns")}
              style={{ background: "none", border: "none", cursor: "pointer", color: "#6B7280", fontSize: 14, padding: "4px 0", display: "flex", alignItems: "center", gap: 4 }}>
              ← Back to newsletters
            </button>
            <span style={{ color: "#E5E7EB" }}>|</span>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              disabled={isSent}
              style={{ fontSize: 18, fontWeight: 700, border: "none", outline: "none", background: "transparent", color: "#111", minWidth: 140 }}
            />
            <Badge tone={isSent ? "success" : "new"}>{isSent ? "Sent" : "Draft"}</Badge>
            <Text as="p" variant="bodySm" tone="subdued">
              {saveStatus === "saving" ? "Saving…" : saveStatus === "saved" ? "Saved ✓" : saveStatus === "error" ? "Save error" : "Last saved 2 minutes ago"}
            </Text>
          </InlineStack>

          <InlineStack gap="200" blockAlign="center">
            {/* Device preview buttons */}
            {activeTab === "edit" && (
              <div style={{ display: "flex", border: "1px solid #E5E7EB", borderRadius: 8, overflow: "hidden" }}>
                {(["desktop", "tablet", "mobile"] as DevicePreview[]).map(d => (
                  <button key={d} onClick={() => { setDevice(d); if (editMode !== "preview") setEditMode("preview"); }}
                    title={d.charAt(0).toUpperCase() + d.slice(1)}
                    style={{
                      padding: "6px 10px", border: "none", cursor: "pointer", fontSize: 14,
                      background: device === d ? "#F3F4F6" : "white",
                      borderRight: d !== "mobile" ? "1px solid #E5E7EB" : "none",
                    }}>
                    {d === "desktop" ? "🖥" : d === "tablet" ? "📱" : "📱"}
                    {d === "desktop" ? "🖥️" : d === "tablet" ? "⬛" : "📱"}
                  </button>
                ))}
              </div>
            )}
            <Button size="slim" onClick={() => setTestModalOpen(true)}>
              Preview & test
            </Button>
            <Button
              size="slim"
              variant="primary"
              disabled={saveStatus === "saving" || isSent}
              onClick={() => {
                handleSave().then(() => {
                  const cur = STEPS.findIndex(s => s.key === activeTab);
                  if (cur < STEPS.length - 1) setActiveTab(STEPS[cur + 1].key);
                });
              }}
            >
              {saveStatus === "saving" ? "Saving…" : "Save & continue"}
            </Button>
          </InlineStack>
        </div>

        {/* ── Step tabs ──────────────────────────────────────────── */}
        <div style={{ display: "flex", gap: 0, borderBottom: "1px solid #E5E7EB", marginBottom: 20 }}>
          {STEPS.map(step => (
            <button key={step.key} onClick={() => setActiveTab(step.key)} style={{
              padding: "10px 20px", border: "none", background: "transparent", cursor: "pointer",
              fontSize: 13, fontWeight: 600,
              color: activeTab === step.key ? "#008060" : "#6B7280",
              borderBottom: activeTab === step.key ? "2px solid #008060" : "2px solid transparent",
              marginBottom: -1,
            }}>
              {step.label}
            </button>
          ))}
        </div>

        {/* ── Tab content ────────────────────────────────────────── */}

        {/* Banners */}
        {!smtpConfigured && activeTab === "send" && (
          <div style={{ marginBottom: 16 }}>
            <Banner tone="warning" title="Sending not configured">
              Add SMTP_HOST and SMTP_USER to your Fly.io secrets to enable sending.
            </Banner>
          </div>
        )}
        {sendResult && (
          <div style={{ marginBottom: 16 }}>
            <Banner
              tone={sendResult.ok ? "success" : "critical"}
              title={sendResult.ok ? `Newsletter sent! ${sendResult.sent} delivered.` : `Send failed: ${sendResult.errors?.join(", ")}`}
              onDismiss={() => setSendResult(null)}
            />
          </div>
        )}

        {/* EDIT TAB */}
        {activeTab === "edit" && (
          <BlockStack gap="400">
            {!isSent && (
              <InlineStack align="space-between" blockAlign="center">
                <Text as="p" variant="bodySm" tone="subdued">
                  {editMode === "unlayer" ? "Drag and drop blocks to design your email." : "Preview mode — use the editor for full editing."}
                </Text>
                <InlineStack gap="200">
                  {editMode === "preview" && (
                    <Button size="slim" onClick={() => setEditMode("unlayer")}>Open in editor</Button>
                  )}
                  {editMode === "unlayer" && campaign.htmlContent && (
                    <Button size="slim" variant="plain" onClick={() => setEditMode("preview")}>Preview mode</Button>
                  )}
                </InlineStack>
              </InlineStack>
            )}

            {/* Fix Unlayer scroll + branding */}
            <style dangerouslySetInnerHTML={{ __html: `
              #unlayer-editor { overflow: hidden !important; }
              #unlayer-editor iframe { border: none !important; }
              #unlayer-editor > div > div:last-child { display: none !important; }
            `}} />

            {editMode === "preview" && campaign.htmlContent && (
              <div style={{ border: "1px solid #E5E7EB", borderRadius: 10, overflow: "hidden", background: "#F8F9FA", display: "flex", justifyContent: "center", padding: device !== "desktop" ? 16 : 0 }}>
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
                  style={{ width: previewWidth ? `${previewWidth}px` : "100%", height: 680, border: "none", display: "block", transition: "width 0.3s" }}
                  title="Email preview"
                />
              </div>
            )}

            {editMode === "preview" && !campaign.htmlContent && (
              <div style={{ padding: 40, textAlign: "center", background: "#F9FAFB", borderRadius: 10, border: "1px dashed #D1D5DB" }}>
                <div style={{ fontSize: 32, marginBottom: 12 }}>✉️</div>
                <Text as="p" variant="bodyMd" tone="subdued">No content yet. Open in editor to design your email.</Text>
                <div style={{ marginTop: 12 }}>
                  <Button size="slim" onClick={() => setEditMode("unlayer")}>Open in editor</Button>
                </div>
              </div>
            )}

            <div
              id="unlayer-editor"
              ref={editorRef}
              style={{
                height: "80vh", minHeight: 700,
                border: "1px solid #E5E7EB", borderRadius: 10, overflow: "hidden",
                display: editMode === "unlayer" && !isSent ? "block" : "none",
              }}
            />

            {isSent && campaign.htmlContent && (
              <div style={{ border: "1px solid #E5E7EB", borderRadius: 10, overflow: "hidden" }}>
                <iframe srcDoc={campaign.htmlContent} style={{ width: "100%", height: 640, border: "none", display: "block" }} title="Sent email" />
              </div>
            )}
          </BlockStack>
        )}

        {/* SETTINGS TAB */}
        {activeTab === "settings" && (
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">Campaign settings</Text>
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
        )}

        {/* RECIPIENTS TAB */}
        {activeTab === "recipients" && (
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">Recipients</Text>
              <InlineStack align="space-between" blockAlign="center">
                <BlockStack gap="050">
                  <Text as="p" variant="bodyMd" fontWeight="semibold">All active subscribers</Text>
                  <Text as="p" variant="bodySm" tone="subdued">Everyone currently subscribed to your newsletter list.</Text>
                </BlockStack>
                <Badge tone="info">{recipientPreview.toLocaleString()} subscribers</Badge>
              </InlineStack>
              <div style={{ padding: "12px 16px", background: "#F9FAFB", borderRadius: 8, display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 14 }}>ℹ️</span>
                <Text as="p" variant="bodySm" tone="subdued">Unsubscribed contacts are automatically excluded.</Text>
              </div>
            </BlockStack>
          </Card>
        )}

        {/* SEND TAB */}
        {activeTab === "send" && (
          <BlockStack gap="400">
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">Ready to send?</Text>
                <InlineStack gap="400" wrap>
                  {[
                    { icon: "📝", label: "Subject", value: subject || "(no subject)", ok: !!subject },
                    { icon: "👥", label: "Recipients", value: `${recipientPreview.toLocaleString()} subscribers`, ok: recipientPreview > 0 },
                    { icon: "✉️", label: "From", value: `${fromName} <${fromEmailVal}>`, ok: !!fromEmailVal },
                  ].map(item => (
                    <div key={item.label} style={{ flex: 1, minWidth: 180, padding: "12px 16px", background: item.ok ? "#F0FDF4" : "#FEF2F2", borderRadius: 8, border: `1px solid ${item.ok ? "#BBF7D0" : "#FECACA"}` }}>
                      <InlineStack gap="150" blockAlign="center">
                        <span>{item.icon}</span>
                        <BlockStack gap="025">
                          <Text as="p" variant="bodySm" tone="subdued">{item.label}</Text>
                          <Text as="p" variant="bodySm" fontWeight="semibold">{item.value}</Text>
                        </BlockStack>
                        <span style={{ marginLeft: "auto", color: item.ok ? "#16A34A" : "#DC2626" }}>{item.ok ? "✓" : "!"}</span>
                      </InlineStack>
                    </div>
                  ))}
                </InlineStack>
                <InlineStack gap="200">
                  <Button
                    variant="primary"
                    disabled={isSent || !smtpConfigured || !subject || recipientPreview === 0}
                    onClick={() => setSendModalOpen(true)}
                  >
                    Send to {recipientPreview.toLocaleString()} subscribers
                  </Button>
                  <Button onClick={() => setTestModalOpen(true)}>Send test email</Button>
                </InlineStack>
              </BlockStack>
            </Card>
          </BlockStack>
        )}

      </BlockStack>

      {/* Send confirmation modal */}
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

      {/* Preview & test modal */}
      <Modal
        open={testModalOpen}
        onClose={() => { setTestModalOpen(false); setTestResult(null); }}
        title="Preview & test"
        primaryAction={{
          content: testSending ? "Sending…" : "Send test email",
          onAction: handleTestSend,
          loading: testSending,
          disabled: !testEmail || testSending,
        }}
        secondaryActions={[{ content: "Close", onAction: () => { setTestModalOpen(false); setTestResult(null); } }]}
      >
        <Modal.Section>
          <BlockStack gap="300">
            <Text as="p" variant="bodySm" tone="subdued">Send a test version of this email to check how it looks in an inbox.</Text>
            {!smtpConfigured && (
              <Banner tone="warning">Email sending is not configured (SMTP missing). Contact support.</Banner>
            )}
            {smtpConfigured && !fromEmailVal && (
              <Banner tone="warning">
                No sender email set. Go to Newsletter → Settings to configure your From email address before sending.
              </Banner>
            )}
            <TextField
              label="Send test to"
              value={testEmail}
              onChange={setTestEmail}
              type="email"
              autoComplete="email"
              placeholder="your@email.com"
            />
            {testResult && (
              <Banner tone={testResult.ok ? "success" : "critical"}>
                {testResult.message}
              </Banner>
            )}
          </BlockStack>
        </Modal.Section>
      </Modal>
    </Page>
  );
}
