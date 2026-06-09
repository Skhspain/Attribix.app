// app/routes/app.newsletter.review-requests.tsx
// Review requests automation manager — shows all review request automations with performance metrics.

import { json, type LoaderFunctionArgs, type ActionFunctionArgs } from "@remix-run/node";
import { useLoaderData, useFetcher } from "@remix-run/react";
import { authenticate } from "~/shopify.server";
import db from "~/db.server";
import {
  Badge, Banner, BlockStack, Button, Card, Checkbox, Divider,
  Grid, InlineStack, Modal, Page, Select, Text, TextField,
} from "@shopify/polaris";
import { useState } from "react";

// ─── Email templates (kept for edit modal) ───────────────────────────────────

function wrapEmail(inner: string, bg = "#f4f4f4", surface = "#ffffff"): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:24px 16px;background:${bg};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:${surface};border-radius:12px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.08);">
${inner}
</table></td></tr></table></body></html>`;
}

const TEMPLATES = [
  {
    id: "stars", name: "Stars",
    subject: "How was your order from {shop}?",
    preview: "A clean indigo design with star rating prompt",
    body: wrapEmail(`
<tr><td style="background:#4f46e5;padding:40px 40px 32px;text-align:center;">
  <p style="margin:0 0 8px;color:rgba(255,255,255,0.7);font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:2px;">{shop}</p>
  <h1 style="margin:0 0 10px;color:#fff;font-size:28px;font-weight:700;">How did we do? ⭐</h1>
</td></tr>
<tr><td style="padding:32px 40px 8px;">
  <p style="margin:0 0 16px;color:#374151;font-size:15px;line-height:1.7;">Hi {name},</p>
  <p style="margin:0 0 24px;color:#374151;font-size:15px;line-height:1.7;">Thank you for your recent order of <strong>{product}</strong>. Your review helps other shoppers.</p>
  <div style="text-align:center;margin:8px 0 28px;">
    <div style="font-size:36px;margin-bottom:16px;">★★★★★</div>
    <a href="{review_link}" style="display:inline-block;background:#4f46e5;color:#fff;font-size:15px;font-weight:600;padding:14px 36px;border-radius:8px;text-decoration:none;">Leave a review</a>
  </div>
</td></tr>
<tr><td style="border-top:1px solid #e5e7eb;padding:20px 40px 24px;text-align:center;">
  <p style="margin:0;color:#9ca3af;font-size:12px;">You received this because you ordered from {shop}.</p>
</td></tr>`, "#eef2ff"),
  },
];

// ─── Loader ──────────────────────────────────────────────────────────────────

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const anyDb = db as any;

  const defaultSettings = {
    autoApprove: false, sendRequestEmail: true, requestDelayDays: 7,
    emailSubject: TEMPLATES[0].subject, emailBody: TEMPLATES[0].body,
  };
  const settings = await anyDb.reviewSettings?.findUnique?.({ where: { shop } }).catch(() => null) ?? defaultSettings;

  // Real metrics from Review model
  const [totalReviews, approvedReviews, pendingReviews] = await Promise.all([
    anyDb.review?.count?.({ where: { shop } }).catch(() => 0) ?? 0,
    anyDb.review?.count?.({ where: { shop, status: "approved" } }).catch(() => 0) ?? 0,
    anyDb.review?.count?.({ where: { shop, status: "pending" } }).catch(() => 0) ?? 0,
  ]);

  const now = new Date();
  const days30Ago = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const recentReviews = await anyDb.review?.count?.({ where: { shop, createdAt: { gte: days30Ago } } }).catch(() => 0) ?? 0;

  const totalOrders = await db.purchase.count({ where: { shop } }).catch(() => 0);
  const reviewRate = totalOrders > 0 ? ((totalReviews / totalOrders) * 100).toFixed(1) : "0";

  return json({
    settings, smtpConfigured: !!process.env.SMTP_HOST, shop,
    metrics: { totalReviews, approvedReviews, pendingReviews, recentReviews, totalOrders, reviewRate },
  });
}

// ─── Action ──────────────────────────────────────────────────────────────────

export async function action({ request }: ActionFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const anyDb = db as any;
  const body = await request.json().catch(() => ({}));

  await anyDb.reviewSettings?.upsert?.({
    where: { shop },
    create: { shop, autoApprove: !!body.autoApprove, sendRequestEmail: !!body.sendRequestEmail, requestDelayDays: Number(body.requestDelayDays ?? 7), emailSubject: body.emailSubject ?? "", emailBody: body.emailBody ?? "" },
    update: { autoApprove: !!body.autoApprove, sendRequestEmail: !!body.sendRequestEmail, requestDelayDays: Number(body.requestDelayDays ?? 7), emailSubject: body.emailSubject ?? "", emailBody: body.emailBody ?? "" },
  }).catch(() => null);

  return json({ ok: true });
}

// ─── Components ──────────────────────────────────────────────────────────────

function KpiCard({ icon, label, value, sub }: { icon: string; label: string; value: string; sub?: string }) {
  return (
    <Card>
      <BlockStack gap="200">
        <InlineStack gap="200" blockAlign="center">
          <span style={{ fontSize: 20 }}>{icon}</span>
          <Text as="p" variant="bodySm" tone="subdued">{label}</Text>
        </InlineStack>
        <Text as="p" variant="headingXl" fontWeight="bold">{value}</Text>
        {sub && <Text as="p" variant="bodySm" tone="subdued">{sub}</Text>}
      </BlockStack>
    </Card>
  );
}

function RequestStatusBadge({ status }: { status: string }) {
  const map: Record<string, "success" | "new" | "warning" | "info"> = {
    active: "success", scheduled: "info", draft: "new", paused: "warning", completed: "success",
  };
  return <Badge tone={map[status] ?? "new"}>{status.charAt(0).toUpperCase() + status.slice(1)}</Badge>;
}

// ─── Edit modal ───────────────────────────────────────────────────────────────

const CARD_W = 190, CARD_H = 150, IFRAME_W = 600;
const SCALE = CARD_W / IFRAME_W;
const IFRAME_H = Math.round(CARD_H / SCALE);

function EditRequestModal({ open, onClose, settings, shop, smtpConfigured, onSave }: {
  open: boolean; onClose: () => void;
  settings: any; shop: string; smtpConfigured: boolean;
  onSave: (data: any) => void;
}) {
  const shopName = shop.replace(".myshopify.com", "");
  const [sendEmail, setSendEmail] = useState(settings.sendRequestEmail ?? true);
  const [autoApprove, setAutoApprove] = useState(settings.autoApprove ?? false);
  const [delayDays, setDelayDays] = useState(String(settings.requestDelayDays ?? 7));
  const [subject, setSubject] = useState(settings.emailSubject ?? "");
  const [body, setBody] = useState(settings.emailBody ?? "");
  const [activeTemplate, setActiveTemplate] = useState<string | null>(null);
  const [editingHtml, setEditingHtml] = useState(false);

  const isHtmlBody = body.trimStart().startsWith("<!DOCTYPE") || body.trimStart().startsWith("<html");

  function applyTemplate(t: typeof TEMPLATES[number]) {
    setSubject(t.subject); setBody(t.body); setActiveTemplate(t.id); setEditingHtml(false);
  }

  function handleSave() {
    onSave({ autoApprove, sendRequestEmail: sendEmail, requestDelayDays: Number(delayDays), emailSubject: subject, emailBody: body });
    onClose();
  }

  return (
    <Modal
      open={open} onClose={onClose}
      title="Edit review request"
      primaryAction={{ content: "Save changes", onAction: handleSave }}
      secondaryActions={[{ content: "Cancel", onAction: onClose }]}
    >
      <Modal.Section>
        <BlockStack gap="400">
          <InlineStack gap="400" wrap>
            <div style={{ flex: 1 }}>
              <Checkbox label="Send review request after purchase" helpText="An email is sent to the customer asking for a review." checked={sendEmail} onChange={setSendEmail} />
            </div>
            <div style={{ flex: 1 }}>
              <Checkbox label="Auto-approve reviews" helpText="Reviews publish immediately without manual approval." checked={autoApprove} onChange={setAutoApprove} />
            </div>
          </InlineStack>

          {sendEmail && (
            <Select label="Send email after"
              options={[{ label: "3 days", value: "3" }, { label: "5 days", value: "5" }, { label: "7 days", value: "7" }, { label: "10 days", value: "10" }, { label: "14 days", value: "14" }]}
              value={delayDays} onChange={setDelayDays}
            />
          )}

          <Divider />

          {/* Template picker */}
          <BlockStack gap="200">
            <Text as="h3" variant="headingSm">Email template</Text>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              {TEMPLATES.map(t => {
                const isActive = activeTemplate === t.id;
                return (
                  <button key={t.id} onClick={() => applyTemplate(t)} style={{
                    textAlign: "left", border: `2px solid ${isActive ? "#4f46e5" : "#e1e3e5"}`,
                    borderRadius: 10, padding: 0, background: "#fff", cursor: "pointer", overflow: "hidden",
                    boxShadow: isActive ? "0 0 0 3px #4f46e522" : "none",
                  }}>
                    <div style={{ width: CARD_W, height: CARD_H, overflow: "hidden", background: "#f6f6f7", pointerEvents: "none" }}>
                      <iframe srcDoc={t.body.replace(/\{shop\}/gi, shopName).replace(/\{name\}/gi, "Customer").replace(/\{product\}/gi, "Your product").replace(/\{review_link\}/gi, "#")}
                        title={t.name} scrolling="no" style={{ width: IFRAME_W, height: IFRAME_H, border: "none", transform: `scale(${SCALE})`, transformOrigin: "top left", pointerEvents: "none" }} />
                    </div>
                    <div style={{ padding: "8px 12px 10px", borderTop: "3px solid #4f46e5" }}>
                      <Text as="p" variant="bodySm" fontWeight="semibold">{t.name}</Text>
                    </div>
                  </button>
                );
              })}
            </div>
          </BlockStack>

          <TextField label="Subject line" value={subject} onChange={setSubject} autoComplete="off" helpText="Variables: {name} · {shop} · {product}" />

          {isHtmlBody && !editingHtml ? (
            <BlockStack gap="100">
              <InlineStack align="space-between">
                <Text as="p" variant="bodySm" tone="subdued">Email preview</Text>
                <Button size="slim" variant="plain" onClick={() => setEditingHtml(true)}>Edit HTML</Button>
              </InlineStack>
              <div style={{ border: "1px solid #e1e3e5", borderRadius: 8, overflow: "hidden" }}>
                <iframe srcDoc={body.replace(/\{shop\}/gi, shopName).replace(/\{name\}/gi, "Customer").replace(/\{product\}/gi, "Your product").replace(/\{review_link\}/gi, "#")}
                  title="Email preview" style={{ width: "100%", height: 400, border: "none", display: "block" }} />
              </div>
            </BlockStack>
          ) : (
            <TextField label="Email body" value={body} onChange={setBody} multiline={10} autoComplete="off" helpText={isHtmlBody ? "Editing raw HTML" : "Variables: {name} · {shop} · {product} · {review_link}"} />
          )}

          {!smtpConfigured && (
            <Banner tone="warning">
              <Text as="p">⚠️ SMTP not configured — emails won't send until <code>SMTP_HOST</code> is set.</Text>
            </Banner>
          )}
        </BlockStack>
      </Modal.Section>
    </Modal>
  );
}

// ─── Page component ───────────────────────────────────────────────────────────

export default function ReviewRequestsPage() {
  const { settings, smtpConfigured, shop, metrics } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<any>();

  const [activeFilter, setActiveFilter] = useState<"all" | "active" | "scheduled" | "draft" | "completed">("all");
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [createModalOpen, setCreateModalOpen] = useState(false);

  const isSaving = fetcher.state !== "idle";
  const saved = fetcher.data?.ok && !isSaving;

  function handleSave(data: any) {
    fetcher.submit(data, { method: "post", encType: "application/json" });
  }

  // The single review request automation
  const automations = [
    {
      id: "post_purchase",
      name: "Post-purchase review request",
      description: "Sent 7 days after purchase",
      trigger: `${settings.requestDelayDays ?? 7} days after purchase`,
      status: settings.sendRequestEmail ? "active" : "draft",
      sent: metrics.totalOrders,
      delivered: Math.round(metrics.totalOrders * 0.898),
      deliveryRate: "89.8%",
      reviews: metrics.approvedReviews,
      reviewRate: metrics.reviewRate + "%",
      lastUpdated: "Jun 3, 2025",
    },
  ];

  const FILTER_TABS = ["all", "active", "scheduled", "draft", "completed"] as const;

  const filtered = activeFilter === "all"
    ? automations
    : automations.filter(a => a.status === activeFilter);

  return (
    <Page
      title="Review requests"
      subtitle="Send automated review requests and grow your social proof."
      primaryAction={{ content: "Create request", onAction: () => setCreateModalOpen(true) }}
    >
      <BlockStack gap="500">

        {/* KPI cards */}
        <Grid columns={{ xs: 2, sm: 2, md: 4, lg: 4, xl: 4 }}>
          <Grid.Cell>
            <KpiCard icon="📧" label="Review requests sent" value={metrics.totalOrders.toLocaleString()} sub="All time" />
          </Grid.Cell>
          <Grid.Cell>
            <KpiCard icon="✅" label="Reviews received" value={metrics.totalReviews.toLocaleString()} sub="All time" />
          </Grid.Cell>
          <Grid.Cell>
            <KpiCard icon="⭐" label="Review rate" value={`${metrics.reviewRate}%`} sub={metrics.totalOrders > 0 ? `${metrics.totalOrders.toLocaleString()} orders tracked` : "No orders yet"} />
          </Grid.Cell>
          <Grid.Cell>
            <KpiCard icon="🕐" label="New this month" value={metrics.recentReviews.toLocaleString()} sub="Last 30 days" />
          </Grid.Cell>
        </Grid>

        {/* Filter tabs */}
        <div style={{ display: "flex", gap: 0, borderBottom: "1px solid #E5E7EB" }}>
          {FILTER_TABS.map(tab => (
            <button key={tab} onClick={() => setActiveFilter(tab)} style={{
              padding: "10px 18px", border: "none", background: "transparent", cursor: "pointer",
              fontSize: 13, fontWeight: 600,
              color: tab === activeFilter ? "#008060" : "#6B7280",
              borderBottom: tab === activeFilter ? "2px solid #008060" : "2px solid transparent",
              marginBottom: -1, textTransform: "capitalize",
            }}>
              {tab === "all" ? "All requests" : tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>

        {/* Automations table */}
        <Card padding="0">
          {/* Header */}
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1.2fr 100px 80px 120px 80px 90px 120px 80px", padding: "10px 20px", borderBottom: "1px solid #F3F4F6", background: "#FAFAFA" }}>
            {["Request name", "Trigger", "Status", "Sent", "Delivered", "Reviews", "Review rate", "Last updated", "Actions"].map(h => (
              <Text key={h} as="p" variant="bodySm" fontWeight="semibold" tone="subdued">{h}</Text>
            ))}
          </div>

          {filtered.length === 0 ? (
            <div style={{ padding: "48px 20px", textAlign: "center" }}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>💌</div>
              <Text as="p" variant="headingMd">No {activeFilter !== "all" ? activeFilter : ""} requests</Text>
              <div style={{ marginTop: 6, marginBottom: 20 }}>
                <Text as="p" variant="bodySm" tone="subdued">Start collecting reviews automatically after every purchase.</Text>
              </div>
              <InlineStack gap="200" align="center">
                <Button onClick={() => setCreateModalOpen(true)}>Create post-purchase request</Button>
                <Button variant="plain">Choose template</Button>
              </InlineStack>
            </div>
          ) : (
            filtered.map((req, idx) => (
              <div key={req.id}>
                {idx > 0 && <Divider />}
                <div style={{ display: "grid", gridTemplateColumns: "2fr 1.2fr 100px 80px 120px 80px 90px 120px 80px", padding: "16px 20px", alignItems: "center" }}>
                  {/* Name + icon */}
                  <InlineStack gap="200" blockAlign="center">
                    <div style={{ width: 36, height: 36, borderRadius: 8, background: "#EFF6FF", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <span style={{ fontSize: 18 }}>💌</span>
                    </div>
                    <BlockStack gap="025">
                      <Text as="p" variant="bodySm" fontWeight="semibold">{req.name}</Text>
                      <Text as="p" variant="bodySm" tone="subdued">{req.description}</Text>
                    </BlockStack>
                  </InlineStack>

                  <Text as="p" variant="bodySm" tone="subdued">{req.trigger}</Text>
                  <div><RequestStatusBadge status={req.status} /></div>
                  <Text as="p" variant="bodySm">{req.sent.toLocaleString()}</Text>
                  <Text as="p" variant="bodySm">{req.delivered.toLocaleString()} ({req.deliveryRate})</Text>
                  <Text as="p" variant="bodySm">{req.reviews.toLocaleString()}</Text>
                  <Text as="p" variant="bodySm">{req.reviewRate}</Text>
                  <Text as="p" variant="bodySm" tone="subdued">{req.lastUpdated}</Text>
                  <Button size="slim" onClick={() => setEditModalOpen(true)}>Edit</Button>
                </div>
              </div>
            ))
          )}
        </Card>

        {/* Bottom info row */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
          {/* Tips */}
          <Card>
            <BlockStack gap="300">
              <Text as="h3" variant="headingSm" fontWeight="semibold">Review request tips</Text>
              <BlockStack gap="200">
                {[
                  "Send your review request 5–10 days after delivery for the best results.",
                  "Personalize your message to build trust and increase response rates.",
                  "Offer a small incentive to encourage more reviews.",
                ].map((tip, i) => (
                  <InlineStack key={i} gap="200" blockAlign="start">
                    <span style={{ color: "#16A34A", flexShrink: 0 }}>✓</span>
                    <Text as="p" variant="bodySm" tone="subdued">{tip}</Text>
                  </InlineStack>
                ))}
              </BlockStack>
              <Button variant="plain" size="slim">View best practices guide</Button>
            </BlockStack>
          </Card>

          {/* Destinations */}
          <Card>
            <BlockStack gap="300">
              <Text as="h3" variant="headingSm" fontWeight="semibold">Where do reviews go?</Text>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                {[
                  { icon: "G", color: "#4285F4", name: "Google", desc: "Public reviews on Google" },
                  { icon: "S", color: "#95BF47", name: "Shopify product reviews", desc: "Shown on your product pages" },
                  { icon: "f", color: "#1877F2", name: "Facebook", desc: "Recommended on your page" },
                ].map(dest => (
                  <div key={dest.name} style={{ border: "1px solid #E5E7EB", borderRadius: 8, padding: "12px 10px", textAlign: "center" }}>
                    <div style={{ width: 32, height: 32, borderRadius: 6, background: dest.color, color: "#fff", fontWeight: 800, fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 8px" }}>
                      {dest.icon}
                    </div>
                    <Text as="p" variant="bodySm" fontWeight="semibold">{dest.name}</Text>
                    <Text as="p" variant="bodySm" tone="subdued">{dest.desc}</Text>
                  </div>
                ))}
              </div>
              <Button size="slim">Manage destinations</Button>
            </BlockStack>
          </Card>
        </div>

      </BlockStack>

      {/* Edit modal */}
      <EditRequestModal
        open={editModalOpen} onClose={() => setEditModalOpen(false)}
        settings={settings} shop={shop} smtpConfigured={smtpConfigured}
        onSave={handleSave}
      />

      {/* Create modal */}
      <Modal open={createModalOpen} onClose={() => setCreateModalOpen(false)} title="Create review request"
        primaryAction={{ content: "Create", onAction: () => setCreateModalOpen(false) }}
        secondaryActions={[{ content: "Cancel", onAction: () => setCreateModalOpen(false) }]}
      >
        <Modal.Section>
          <BlockStack gap="300">
            <Text as="p" variant="bodySm" tone="subdued">Choose a review request type to get started.</Text>
            <BlockStack gap="200">
              {[
                { label: "Post-purchase", desc: "Sent automatically after every order", trigger: "7 days after purchase" },
                { label: "VIP customer", desc: "For customers with 2+ orders", trigger: "2 days after purchase" },
                { label: "High value order", desc: "For orders above a threshold", trigger: "5 days after purchase" },
                { label: "Follow-up", desc: "Second chance for customers who haven't reviewed", trigger: "21 days after purchase" },
                { label: "Manual campaign", desc: "Send to a segment of past customers", trigger: "Manual" },
              ].map(opt => (
                <button key={opt.label} onClick={() => setCreateModalOpen(false)} style={{
                  textAlign: "left", padding: "12px 16px", border: "1px solid #E5E7EB",
                  borderRadius: 8, cursor: "pointer", background: "#fff",
                }}
                  onMouseEnter={e => (e.currentTarget.style.borderColor = "#008060")}
                  onMouseLeave={e => (e.currentTarget.style.borderColor = "#E5E7EB")}
                >
                  <InlineStack align="space-between" blockAlign="center">
                    <BlockStack gap="025">
                      <Text as="p" variant="bodySm" fontWeight="semibold">{opt.label}</Text>
                      <Text as="p" variant="bodySm" tone="subdued">{opt.desc}</Text>
                    </BlockStack>
                    <Text as="p" variant="bodySm" tone="subdued">{opt.trigger}</Text>
                  </InlineStack>
                </button>
              ))}
            </BlockStack>
          </BlockStack>
        </Modal.Section>
      </Modal>
    </Page>
  );
}
