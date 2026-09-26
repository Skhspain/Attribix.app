// app/routes/app.newsletter.campaigns.$id.tsx
// Campaign editor: design (block editor), details (subject, sender) and send.
// Reached after template selection in app.newsletter.campaigns.new.tsx.

import {
  json,
  type LoaderFunctionArgs,
  type ActionFunctionArgs,
} from "@remix-run/node";
import { useLoaderData, useNavigate, useRevalidator } from "@remix-run/react";
import { authenticate } from "~/shopify.server";
import db from "~/db.server";
import {
  Badge,
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
  ProgressBar,
  Select,
  Tabs,
  Text,
  TextField,
} from "@shopify/polaris";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuthenticatedFetch } from "~/utils/useAuthenticatedFetch";
import { countSubscribersForSegment } from "~/services/newsletter.server";
import { EmailEditor } from "~/components/email/EmailEditor";
import { isEmailDoc, renderEmail, type EmailDoc } from "~/email/blocks";
import { STARTER_TEMPLATES } from "~/email/templates";

// ─── Loader ──────────────────────────────────────────────────────────────────

export async function loader({ request, params }: LoaderFunctionArgs) {
  const { session, admin } = await authenticate.admin(request);
  const shop = session.shop;
  const anyDb = db as any;

  const [campaign, newsletterSettings] = await Promise.all([
    anyDb.newsletterCampaign?.findUnique?.({ where: { id: params.id } }),
    anyDb.newsletterSettings?.findUnique?.({ where: { shop } }).catch(() => null),
  ]);

  if (!campaign || campaign.shop !== shop) {
    throw new Response("Campaign not found", { status: 404 });
  }

  const { getStoreBrand } = await import("~/email/brand.server");
  const { campaignProgress } = await import("~/services/newsletterQueue.server");
  const [recipientPreview, brand, sourceRows, progress] = await Promise.all([
    countSubscribersForSegment(shop, campaign.segmentFilter ?? {}),
    getStoreBrand(shop, admin),
    db.newsletterSubscriber.groupBy({ by: ["source"], where: { shop, status: "subscribed" }, _count: { _all: true } }).catch(() => [] as any[]),
    campaign.status === "sending" || campaign.status === "sent" ? campaignProgress(campaign.id) : Promise.resolve(null),
  ]);
  const sources = (sourceRows as any[])
    .filter((r) => r.source)
    .map((r) => ({ value: r.source as string, count: r._count._all as number }))
    .sort((a, b) => b.count - a.count);
  const sendingAvailable = !!process.env.SMTP_HOST;

  // HMAC token used by the /api/newsletter/test-send endpoint so the client
  // can send a test email without needing a live Shopify session token.
  const { createHmac } = await import("node:crypto");
  const testSendToken = createHmac("sha256", process.env.SHOPIFY_API_SECRET ?? "fallback")
    .update(`${shop}:${params.id}`)
    .digest("hex")
    .slice(0, 32);

  return json({
    campaign,
    shop,
    brand,
    sources,
    progress,
    recipientPreview,
    sendingAvailable,
    testSendToken,
    defaultFromName: newsletterSettings?.fromName || brand.storeName || "",
    defaultFromEmail: newsletterSettings?.fromEmail || "",
    defaultReplyTo: newsletterSettings?.replyTo || "",
  });
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

  const campaign = await anyDb.newsletterCampaign?.findUnique?.({ where: { id: params.id } });
  if (!campaign || campaign.shop !== shop) {
    return json({ ok: false, error: "Campaign not found" }, { status: 404 });
  }

  if (intent === "save") {
    if (campaign.status === "sent" || campaign.status === "sending") {
      return json({ ok: false, error: "This newsletter has already been sent." }, { status: 400 });
    }
    // The server renders the HTML from the block document, so what's stored is
    // exactly what the editor previewed. Old Unlayer campaigns keep their HTML
    // until the merchant starts a new design.
    const doc = isEmailDoc(body.doc) ? (body.doc as EmailDoc) : null;
    const previewText = body.previewText || null;

    await anyDb.newsletterCampaign.update({
      where: { id: params.id },
      data: {
        name: body.name || "Untitled newsletter",
        subject: body.subject || "",
        previewText,
        fromName: body.fromName || null,
        fromEmail: body.fromEmail || null,
        replyTo: body.replyTo || null,
        segmentFilter: cleanSegment(body.segmentFilter),
        ...(doc && { designJson: doc, htmlContent: renderEmail(doc, { previewText: previewText ?? undefined }) }),
        status: "draft",
      },
    });

    // Remember sender identity for future campaigns
    if (body.fromName || body.fromEmail || body.replyTo) {
      await anyDb.newsletterSettings.upsert({
        where: { shop },
        create: { shop, fromName: body.fromName || "", fromEmail: body.fromEmail || "", replyTo: body.replyTo || "" },
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
    if (!isEmailDoc(body.doc)) return json({ ok: false, error: "Nothing to save yet." }, { status: 400 });
    await anyDb.newsletterCampaign.create({
      data: {
        shop,
        name: body.name || "My template",
        subject: body.subject || "",
        status: "template",
        designJson: body.doc,
        htmlContent: renderEmail(body.doc),
      },
    });
    return json({ ok: true, saved: "template" });
  }

  if (intent === "count") {
    return json({ ok: true, count: await countSubscribersForSegment(shop, cleanSegment(body.segmentFilter)) });
  }

  if (intent === "progress") {
    const { campaignProgress } = await import("~/services/newsletterQueue.server");
    return json({ ok: true, status: campaign.status, progress: await campaignProgress(campaign.id) });
  }

  if (intent === "cancel-schedule") {
    await anyDb.newsletterCampaign.updateMany({ where: { id: campaign.id, status: "scheduled" }, data: { status: "draft", scheduledAt: null } });
    return json({ ok: true });
  }

  if (intent === "send" || intent === "schedule") {
    if (campaign.status !== "draft") {
      return json({ ok: false, error: "This newsletter has already been sent or scheduled." }, { status: 400 });
    }
    if (!campaign.subject?.trim()) {
      return json({ ok: false, error: "Add a subject line before sending." }, { status: 400 });
    }

    const { getShopPlan, checkNewsletterSendsQuota } = await import("~/services/plan.server");
    const recipientCount = await countSubscribersForSegment(shop, campaign.segmentFilter ?? {});
    const quota = await checkNewsletterSendsQuota(shop, await getShopPlan(shop, admin), recipientCount);
    if (!quota.allowed) {
      return json({
        ok: false,
        error: `Email send limit reached (${quota.used.toLocaleString()} of ${quota.limit.toLocaleString()} sent this month). Upgrade your plan to send more.`,
      }, { status: 403 });
    }

    if (intent === "schedule") {
      const at = new Date(String(body.scheduledAt ?? ""));
      if (!Number.isFinite(at.getTime()) || at.getTime() < Date.now() + 60_000) {
        return json({ ok: false, error: "Pick a time at least a few minutes from now." }, { status: 400 });
      }
      await anyDb.newsletterCampaign.update({ where: { id: campaign.id }, data: { status: "scheduled", scheduledAt: at } });
      return json({ ok: true, scheduled: at.toISOString() });
    }

    const { enqueueCampaign } = await import("~/services/newsletterQueue.server");
    const result = await enqueueCampaign(campaign.id);
    return json(result, { status: result.ok ? 200 : 400 });
  }

  return json({ ok: false, error: "Unknown intent" }, { status: 400 });
}

function rate(count: number | null | undefined, of: number | null | undefined) {
  const n = count ?? 0;
  return of ? `${((n / of) * 100).toFixed(1)}%` : n.toLocaleString();
}

const SOURCE_LABELS: Record<string, string> = {
  popup: "Popup",
  popup_classic: "Popup",
  slide_in: "Slide-in",
  banner: "Banner",
  inline_form: "Inline form",
  embedded: "Footer form",
  manual: "Added by you",
  import: "Imported",
  post_purchase: "After purchase",
};
function sourceLabel(s: string) {
  return SOURCE_LABELS[s] ?? s.replace(/_/g, " ");
}

/** Only the segment options the editor offers; anything else is dropped. */
function cleanSegment(raw: any) {
  const seg: Record<string, unknown> = {};
  if (raw?.source && typeof raw.source === "string") seg.source = raw.source;
  const days = Number(raw?.joinedWithinDays);
  if (Number.isFinite(days) && days > 0) seg.joinedWithinDays = Math.min(3650, Math.round(days));
  return seg;
}

// ─── Component ───────────────────────────────────────────────────────────────

const TABS = [
  { id: "design", content: "Design" },
  { id: "details", content: "Details" },
  { id: "send", content: "Review & send" },
];

export default function CampaignEditor() {
  const data = useLoaderData<typeof loader>();
  const { campaign, brand, sendingAvailable, testSendToken, shop, sources } = data;
  const navigate = useNavigate();
  const revalidator = useRevalidator();
  const authFetch = useAuthenticatedFetch();

  // Anything but a draft is locked: scheduled (cancel to edit), sending or sent.
  const status: string = campaign.status;
  const isSent = status !== "draft";
  const initialSegment = (campaign.segmentFilter ?? {}) as { source?: string; joinedWithinDays?: number };
  const [segSource, setSegSource] = useState(initialSegment.source ?? "");
  const [segDays, setSegDays] = useState(initialSegment.joinedWithinDays ? String(initialSegment.joinedWithinDays) : "");
  const [recipientPreview, setRecipientPreview] = useState<number>(data.recipientPreview);
  const [scheduleAt, setScheduleAt] = useState("");
  const [progress, setProgress] = useState(data.progress);
  const [doc, setDoc] = useState<EmailDoc | null>(isEmailDoc(campaign.designJson) ? (campaign.designJson as EmailDoc) : null);
  const [name, setName] = useState(campaign.name || "");
  const [subject, setSubject] = useState(campaign.subject || "");
  const [previewText, setPreviewText] = useState(campaign.previewText || "");
  const [fromName, setFromName] = useState(campaign.fromName || data.defaultFromName);
  const [fromEmail, setFromEmail] = useState(campaign.fromEmail || data.defaultFromEmail);
  const [replyTo, setReplyTo] = useState(campaign.replyTo || data.defaultReplyTo);

  const [tab, setTab] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [templateModal, setTemplateModal] = useState(false);
  const [sendModal, setSendModal] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [testEmail, setTestEmail] = useState("");
  const [testSending, setTestSending] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  const touch = <T,>(setter: (v: T) => void) => (v: T) => { setter(v); setDirty(true); };
  const segment = useMemo(
    () => ({ ...(segSource && { source: segSource }), ...(Number(segDays) > 0 && { joinedWithinDays: Number(segDays) }) }),
    [segSource, segDays],
  );

  const post = useCallback(async (payload: Record<string, unknown>) => {
    const res = await authFetch(`/app/newsletter/campaigns/${campaign.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(payload),
    });
    return res.json().catch(() => ({ ok: false, error: "Unexpected response from the server." }));
  }, [authFetch, campaign.id]);

  // Live recipient count while the segment changes.
  useEffect(() => {
    if (isSent) return;
    const t = setTimeout(async () => {
      const r = await post({ intent: "count", segmentFilter: segment }).catch(() => null);
      if (r?.ok) setRecipientPreview(r.count);
    }, 300);
    return () => clearTimeout(t);
  }, [segment, isSent, post]);

  // Sending happens in the background; poll progress until it's done.
  useEffect(() => {
    if (status !== "sending") return;
    const id = setInterval(async () => {
      const r = await post({ intent: "progress" }).catch(() => null);
      if (!r?.ok) return;
      setProgress(r.progress);
      if (r.status !== "sending") revalidator.revalidate();
    }, 4000);
    return () => clearInterval(id);
  }, [status, post, revalidator]);
  const footer = doc?.blocks.find((b) => b.type === "footer");
  const missingAddress = !!doc && !(footer && footer.type === "footer" && footer.address.trim());

  const save = useCallback(async () => {
    setSaving(true);
    setSaveError(null);
    try {
      const res = await authFetch(`/app/newsletter/campaigns/${campaign.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ intent: "save", name, subject, previewText, fromName, fromEmail, replyTo, doc, segmentFilter: segment }),
      });
      const result = await res.json().catch(() => ({ ok: false, error: "Unexpected response" }));
      if (!result.ok) throw new Error(result.error || "Save failed");
      setDirty(false);
      return true;
    } catch (e: any) {
      setSaveError(e?.message || "Save failed");
      return false;
    } finally {
      setSaving(false);
    }
  }, [authFetch, campaign.id, name, subject, previewText, fromName, fromEmail, replyTo, doc, segment]);

  const uploadImage = useCallback(async (file: File) => {
    const form = new FormData();
    form.append("file", file);
    try {
      const res = await authFetch("/api/newsletter/image-upload", { method: "POST", body: form });
      const result = await res.json();
      return (result?.url as string) || null;
    } catch {
      return null;
    }
  }, [authFetch]);

  const sendTest = async () => {
    if (!testEmail) return;
    setTestSending(true);
    setTestResult(null);
    if (dirty && !(await save())) { setTestSending(false); return; }
    try {
      const res = await fetch("/api/newsletter/test-send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaignId: campaign.id, shop, token: testSendToken, testEmail, subject, fromName, previewText }),
      });
      const result = await res.json().catch(() => ({ ok: false, error: `Server error (HTTP ${res.status})` }));
      setTestResult({ ok: !!result.ok, message: result.ok ? `Test sent to ${testEmail}.` : result.error || "Send failed." });
    } catch {
      setTestResult({ ok: false, message: "Couldn't reach the server. Check your connection and try again." });
    } finally {
      setTestSending(false);
    }
  };

  const send = async (mode: "now" | "schedule") => {
    setSending(true);
    if (dirty && !(await save())) { setSending(false); setSendModal(false); return; }
    try {
      const result = mode === "now"
        ? await post({ intent: "send" })
        : await post({ intent: "schedule", scheduledAt: new Date(scheduleAt).toISOString() });
      if (result?.ok) {
        setSendResult({
          ok: true,
          message: mode === "now"
            ? `Sending to ${Number(result.queued ?? 0).toLocaleString()} subscribers. You can leave this page — it keeps going in the background.`
            : `Scheduled for ${new Date(result.scheduled).toLocaleString()}.`,
        });
        revalidator.revalidate();
      } else {
        setSendResult({ ok: false, message: result?.error || "Sending failed." });
      }
    } catch {
      setSendResult({ ok: false, message: "Couldn't reach the server. Check the newsletter list before trying again — it may already be sending." });
    } finally {
      setSending(false);
      setSendModal(false);
    }
  };

  const cancelSchedule = async () => {
    const r = await post({ intent: "cancel-schedule" });
    if (r?.ok) {
      setSendResult(null);
      revalidator.revalidate();
    }
  };

  const checks = [
    { label: "Subject line", ok: !!subject.trim(), value: subject || "Missing" },
    { label: "Sender name", ok: !!fromName.trim(), value: fromName || "Missing" },
    { label: "Recipients", ok: recipientPreview > 0, value: `${recipientPreview.toLocaleString()} subscribers` },
    { label: "Store address in footer", ok: !missingAddress, value: missingAddress ? "Missing" : "Added" },
  ];
  const canSend = !isSent && sendingAvailable && checks.every((c) => c.ok) && !!doc;
  const statusBadge: Record<string, { label: string; tone?: "success" | "info" | "attention" | "critical" }> = {
    draft: { label: "Draft" },
    scheduled: { label: "Scheduled", tone: "info" },
    sending: { label: "Sending", tone: "attention" },
    sent: { label: "Sent", tone: "success" },
    failed: { label: "Failed", tone: "critical" },
  };
  const badge = statusBadge[status] ?? { label: status };
  const minSchedule = new Date(Date.now() + 5 * 60_000 - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 16);

  return (
    <Page
      fullWidth
      backAction={{ content: "Newsletters", onAction: () => navigate("/app/newsletter/campaigns") }}
      title={name || "Untitled newsletter"}
      titleMetadata={<Badge tone={badge.tone}>{badge.label}</Badge>}
      primaryAction={isSent ? undefined : { content: dirty ? "Save" : "Saved", onAction: save, loading: saving, disabled: !dirty }}
      secondaryActions={
        isSent || !doc
          ? []
          : [
              { content: "Start from a template", onAction: () => setTemplateModal(true) },
              {
                content: "Save as template",
                onAction: async () => {
                  await authFetch(`/app/newsletter/campaigns/${campaign.id}`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json", Accept: "application/json" },
                    body: JSON.stringify({ intent: "save-as-template", name, subject, doc }),
                  });
                  (window as any).shopify?.toast?.show?.("Saved as template");
                },
              },
            ]
      }
    >
      <BlockStack gap="400">
        {saveError && <Banner tone="critical" title="Couldn't save" onDismiss={() => setSaveError(null)}>{saveError}</Banner>}
        {status === "scheduled" && campaign.scheduledAt && (
          <Banner tone="info" title={`Scheduled for ${new Date(campaign.scheduledAt).toLocaleString()}`} action={{ content: "Cancel schedule", onAction: cancelSchedule }}>
            Cancel the schedule to make changes.
          </Banner>
        )}
        {status === "sending" && progress && (
          <Card>
            <BlockStack gap="200">
              <Text as="h2" variant="headingSm">{`Sending… ${progress.done.toLocaleString()} of ${progress.total.toLocaleString()}`}</Text>
              <ProgressBar progress={progress.total ? Math.round((progress.done / progress.total) * 100) : 0} size="small" />
              <Text as="p" tone="subdued">This keeps going in the background, so you can leave this page.</Text>
            </BlockStack>
          </Card>
        )}
        {status === "sent" && (
          <Card>
            <InlineGrid columns={{ xs: 2, md: 5 }} gap="400">
              {[
                { label: "Sent", value: (progress?.sent ?? campaign.deliveredCount ?? 0).toLocaleString() },
                { label: "Opened", value: rate(campaign.openCount, progress?.sent ?? campaign.deliveredCount) },
                { label: "Clicked", value: rate(campaign.clickCount, progress?.sent ?? campaign.deliveredCount) },
                { label: "Bounced", value: (campaign.bounceCount ?? 0).toLocaleString() },
                { label: "Unsubscribed / spam", value: (campaign.unsubCount ?? 0).toLocaleString() },
              ].map((m) => (
                <BlockStack key={m.label} gap="100">
                  <Text as="p" tone="subdued">{m.label}</Text>
                  <Text as="p" variant="headingLg">{m.value}</Text>
                </BlockStack>
              ))}
            </InlineGrid>
          </Card>
        )}
        {sendResult && (
          <Banner tone={sendResult.ok ? "success" : "critical"} onDismiss={() => setSendResult(null)}>{sendResult.message}</Banner>
        )}

        <Tabs tabs={TABS} selected={tab} onSelect={setTab} />

        {tab === 0 && (
          doc ? (
            <EmailEditor
              doc={doc}
              onChange={(d) => { setDoc(d); setDirty(true); }}
              brand={brand}
              previewText={previewText}
              disabled={isSent}
              uploadImage={uploadImage}
            />
          ) : (
            <BlockStack gap="400">
              {!isSent && (
                <Banner
                  tone="info"
                  title="This newsletter was made with the old editor"
                  action={{ content: "Start a new design", onAction: () => setTemplateModal(true) }}
                >
                  It can still be sent as it is. To change it, start a new design from a template — this replaces the current content.
                </Banner>
              )}
              {campaign.htmlContent ? (
                <Card padding="0">
                  <iframe title="Email preview" srcDoc={campaign.htmlContent} sandbox="" style={{ width: "100%", height: 720, border: 0, display: "block" }} />
                </Card>
              ) : (
                <Card>
                  <BlockStack gap="300" inlineAlign="start">
                    <Text as="p">No content yet.</Text>
                    <Button onClick={() => setTemplateModal(true)}>Choose a template</Button>
                  </BlockStack>
                </Card>
              )}
            </BlockStack>
          )
        )}

        {tab === 1 && (
          <Box maxWidth="720px">
            <Card>
              <FormLayout>
                <TextField label="Internal name" helpText="Only you see this." value={name} onChange={touch(setName)} autoComplete="off" disabled={isSent} />
                <TextField label="Subject line" value={subject} onChange={touch(setSubject)} autoComplete="off" disabled={isSent} showCharacterCount maxLength={120} error={subject.trim() ? undefined : "Required"} />
                <TextField label="Preview text" helpText="The short line shown after the subject in most inboxes." value={previewText} onChange={touch(setPreviewText)} autoComplete="off" disabled={isSent} showCharacterCount maxLength={150} />
                <TextField label="Sender name" value={fromName} onChange={touch(setFromName)} autoComplete="off" disabled={isSent} error={fromName.trim() ? undefined : "Required"} />
                <FormLayout.Group>
                  <TextField
                    label="Sender email"
                    type="email"
                    helpText="Used as the sender once your domain is verified under Settings. Until then, replies go here."
                    value={fromEmail}
                    onChange={touch(setFromEmail)}
                    autoComplete="email"
                    disabled={isSent}
                  />
                  <TextField label="Reply-to email (optional)" type="email" helpText="If replies should go somewhere else." value={replyTo} onChange={touch(setReplyTo)} autoComplete="email" disabled={isSent} />
                </FormLayout.Group>
              </FormLayout>
            </Card>
          </Box>
        )}

        {tab === 2 && (
          <Box maxWidth="720px">
            <BlockStack gap="400">
              {!sendingAvailable && (
                <Banner tone="warning" title="Sending isn't available yet">
                  Email sending hasn't been switched on for your store. Contact Attribix support.
                </Banner>
              )}
              <Card>
                <BlockStack gap="300">
                  <Text as="h2" variant="headingMd">Recipients</Text>
                  <FormLayout>
                    <FormLayout.Group>
                      <Select
                        label="Who signed up via"
                        disabled={isSent}
                        options={[{ label: "Any signup form", value: "" }, ...sources.map((src: any) => ({ label: `${sourceLabel(src.value)} (${src.count.toLocaleString()})`, value: src.value }))]}
                        value={segSource}
                        onChange={touch(setSegSource)}
                      />
                      <Select
                        label="Subscribed"
                        disabled={isSent}
                        options={[
                          { label: "Any time", value: "" },
                          { label: "In the last 7 days", value: "7" },
                          { label: "In the last 30 days", value: "30" },
                          { label: "In the last 90 days", value: "90" },
                          { label: "In the last year", value: "365" },
                        ]}
                        value={segDays}
                        onChange={touch(setSegDays)}
                      />
                    </FormLayout.Group>
                  </FormLayout>
                  <Text as="p" tone="subdued">
                    {`${recipientPreview.toLocaleString()} subscribers match. People who unsubscribed, bounced or haven't confirmed their signup are never included.`}
                  </Text>
                </BlockStack>
              </Card>
              <Card>
                <BlockStack gap="300">
                  <Text as="h2" variant="headingMd">Checklist</Text>
                  {checks.map((c) => (
                    <InlineGrid key={c.label} columns="1fr auto" gap="200">
                      <BlockStack gap="050">
                        <Text as="p" fontWeight="semibold">{c.label}</Text>
                        <Text as="p" tone="subdued" truncate>{c.value}</Text>
                      </BlockStack>
                      <Badge tone={c.ok ? "success" : "critical"}>{c.ok ? "Ready" : "Needs attention"}</Badge>
                    </InlineGrid>
                  ))}
                </BlockStack>
              </Card>
              <Card>
                <BlockStack gap="300">
                  <Text as="h2" variant="headingMd">Send a test</Text>
                  <InlineStack gap="200" blockAlign="end" wrap={false}>
                    <Box width="100%">
                      <TextField label="Email address" type="email" value={testEmail} onChange={setTestEmail} autoComplete="email" placeholder="you@yourstore.com" />
                    </Box>
                    <Button onClick={sendTest} loading={testSending} disabled={!testEmail || !sendingAvailable || !subject.trim() || !fromName.trim()}>Send test</Button>
                  </InlineStack>
                  {testResult && <Banner tone={testResult.ok ? "success" : "critical"}>{testResult.message}</Banner>}
                </BlockStack>
              </Card>
              {!isSent && (
                <Card>
                  <BlockStack gap="300">
                    <Text as="h2" variant="headingMd">Send</Text>
                    <InlineStack gap="300" blockAlign="end" wrap>
                      <Button variant="primary" disabled={!canSend} onClick={() => setSendModal(true)}>
                        {`Send now to ${recipientPreview.toLocaleString()} subscribers`}
                      </Button>
                      <Text as="span" tone="subdued">or</Text>
                      <Box minWidth="220px">
                        <TextField label="Schedule for" type="datetime-local" value={scheduleAt} min={minSchedule} onChange={setScheduleAt} autoComplete="off" helpText="Your computer's time zone." />
                      </Box>
                      <Button disabled={!canSend || !scheduleAt} loading={sending} onClick={() => send("schedule")}>Schedule</Button>
                    </InlineStack>
                  </BlockStack>
                </Card>
              )}
            </BlockStack>
          </Box>
        )}
      </BlockStack>

      <Modal
        open={sendModal}
        onClose={() => setSendModal(false)}
        title="Send newsletter?"
        primaryAction={{ content: `Send to ${recipientPreview.toLocaleString()} subscribers`, onAction: () => send("now"), loading: sending }}
        secondaryActions={[{ content: "Cancel", onAction: () => setSendModal(false) }]}
      >
        <Modal.Section>
          <Text as="p">
            <strong>{subject}</strong> goes to {recipientPreview.toLocaleString()} subscribers. You can't undo this.
          </Text>
        </Modal.Section>
      </Modal>

      <Modal
        open={templateModal}
        onClose={() => setTemplateModal(false)}
        title="Start from a template"
        size="large"
      >
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
                          setTab(0);
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
    </Page>
  );
}
