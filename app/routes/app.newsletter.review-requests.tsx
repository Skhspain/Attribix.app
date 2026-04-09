// app/routes/app.newsletter.review-requests.tsx
// Review request email settings with templates — lives under the Newsletter hub.

import { json, type LoaderFunctionArgs, type ActionFunctionArgs } from "@remix-run/node";
import { useLoaderData, useFetcher } from "@remix-run/react";
import { authenticate } from "~/shopify.server";
import db from "~/db.server";
import {
  BlockStack,
  Button,
  Card,
  Checkbox,
  InlineStack,
  Select,
  Text,
  TextField,
  Divider,
  Badge,
} from "@shopify/polaris";
import { useState } from "react";

// ─── Templates ───────────────────────────────────────────────────────────────

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
    id: "stars",
    name: "Stars",
    subject: "How was your order from {shop}?",
    preview: "A clean indigo design with star rating prompt",
    body: wrapEmail(`
<tr><td style="background:#4f46e5;padding:40px 40px 32px;text-align:center;">
  <p style="margin:0 0 8px;color:rgba(255,255,255,0.7);font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:2px;">{shop}</p>
  <h1 style="margin:0 0 10px;color:#fff;font-size:28px;font-weight:700;line-height:1.2;">How did we do? ⭐</h1>
  <p style="margin:0;color:rgba(255,255,255,0.85);font-size:15px;">Your opinion matters more than you know.</p>
</td></tr>
<tr><td style="padding:32px 40px 8px;">
  <p style="margin:0 0 16px;color:#374151;font-size:15px;line-height:1.7;">Hi {name},</p>
  <p style="margin:0 0 16px;color:#374151;font-size:15px;line-height:1.7;">Thank you for your recent order of <strong>{product}</strong>. We hope you love it!</p>
  <p style="margin:0 0 24px;color:#374151;font-size:15px;line-height:1.7;">Your review helps other shoppers and helps us keep improving. It only takes 30 seconds.</p>
  <div style="text-align:center;margin:8px 0 28px;">
    <div style="font-size:36px;margin-bottom:16px;">★★★★★</div>
    <a href="{review_link}" style="display:inline-block;background:#4f46e5;color:#fff;font-size:15px;font-weight:600;padding:14px 36px;border-radius:8px;text-decoration:none;">Leave a review</a>
  </div>
</td></tr>
<tr><td style="border-top:1px solid #e5e7eb;padding:20px 40px 24px;text-align:center;">
  <p style="margin:0;color:#9ca3af;font-size:12px;">You received this because you ordered from {shop}. Questions? Just reply to this email.</p>
</td></tr>`, "#eef2ff"),
  },
  {
    id: "grateful",
    name: "Thank You",
    subject: "Your feedback means the world to us, {name}",
    preview: "Warm amber tone with a heartfelt thank-you message",
    body: wrapEmail(`
<tr><td style="background:#f59e0b;padding:44px 40px 36px;text-align:center;">
  <p style="margin:0 0 8px;color:rgba(255,255,255,0.8);font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:2px;">{shop}</p>
  <h1 style="margin:0;color:#fff;font-size:30px;font-weight:800;line-height:1.2;">Your feedback means<br>the world to us 🙏</h1>
</td></tr>
<tr><td style="padding:0;"><img src="https://picsum.photos/seed/thankful99/600/180" width="600" height="180" alt="" style="width:100%;max-width:600px;height:180px;object-fit:cover;display:block;"></td></tr>
<tr><td style="padding:32px 40px 8px;">
  <p style="margin:0 0 16px;color:#374151;font-size:15px;line-height:1.7;">Hi {name},</p>
  <p style="margin:0 0 16px;color:#374151;font-size:15px;line-height:1.7;">We hope you're loving your <strong>{product}</strong>. Customer reviews help us improve and help other shoppers make great decisions.</p>
  <p style="margin:0 0 24px;color:#374151;font-size:15px;line-height:1.7;">If you have a moment, we'd be incredibly grateful for your honest thoughts — it only takes 30 seconds.</p>
</td></tr>
<tr><td align="center" style="padding:8px 40px 32px;">
  <a href="{review_link}" style="display:inline-block;background:#f59e0b;color:#fff;font-size:15px;font-weight:600;padding:14px 32px;border-radius:8px;text-decoration:none;">Share your experience →</a>
</td></tr>
<tr><td style="border-top:1px solid #e5e7eb;padding:20px 40px 24px;text-align:center;">
  <p style="margin:0;color:#9ca3af;font-size:12px;">With gratitude, the {shop} team. Questions? Just reply to this email.</p>
</td></tr>`, "#fffbeb"),
  },
  {
    id: "vip",
    name: "VIP",
    subject: "A quick favour from us, {name}",
    preview: "Dark elegant design for a premium brand feel",
    body: wrapEmail(`
<tr><td style="background:#111827;padding:0;">
  <div style="background:linear-gradient(135deg,#7c3aed,#4f46e5);height:5px;"></div>
  <div style="padding:44px 40px 36px;text-align:center;">
    <p style="margin:0 0 8px;color:#a78bfa;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:3px;">{shop}</p>
    <h1 style="margin:0 0 10px;color:#fff;font-size:28px;font-weight:700;line-height:1.3;">Your opinion matters, {name}.</h1>
    <p style="margin:0;color:#9ca3af;font-size:15px;line-height:1.6;">As one of our valued customers, we'd love to hear from you.</p>
  </div>
</td></tr>
<tr><td style="background:#1f2937;padding:32px 40px;">
  <p style="margin:0 0 16px;color:#d1d5db;font-size:15px;line-height:1.7;">We'd love to hear your honest thoughts on <strong style="color:#fff;">{product}</strong>. Your review helps us keep improving and helps other customers like you make the right choice.</p>
  <p style="margin:0 0 28px;color:#d1d5db;font-size:15px;line-height:1.7;">It only takes 30 seconds — and it makes a real difference.</p>
  <div style="text-align:center;">
    <a href="{review_link}" style="display:inline-block;background:linear-gradient(135deg,#7c3aed,#4f46e5);color:#fff;font-size:15px;font-weight:600;padding:14px 36px;border-radius:8px;text-decoration:none;">Write a review ★</a>
  </div>
</td></tr>
<tr><td style="background:#111827;border-top:1px solid #374151;padding:20px 40px 24px;text-align:center;">
  <p style="margin:0;color:#6b7280;font-size:12px;">You received this because you ordered from {shop}. Questions? Just reply to this email.</p>
</td></tr>`, "#0f172a", "#111827"),
  },
  {
    id: "minimal",
    name: "Minimal",
    subject: "A quick review request from {shop}",
    preview: "Clean, typography-led. Subtle and non-intrusive",
    body: wrapEmail(`
<tr><td style="padding:56px 40px 8px;text-align:center;">
  <p style="margin:0 0 4px;color:#92765a;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:3px;">{shop}</p>
  <div style="width:40px;height:2px;background:#92765a;margin:12px auto 24px;"></div>
  <h1 style="margin:0 0 16px;color:#1f2937;font-size:24px;font-weight:300;font-style:italic;line-height:1.3;">How was your experience, {name}?</h1>
</td></tr>
<tr><td style="padding:8px 40px;">
  <p style="margin:0 0 16px;color:#6b7280;font-size:15px;line-height:1.7;text-align:center;">We hope you're enjoying your <strong style="color:#374151;">{product}</strong>.<br>A short review would mean a lot to us.</p>
</td></tr>
<tr><td align="center" style="padding:16px 40px 40px;">
  <a href="{review_link}" style="display:inline-block;background:#92765a;color:#fff;font-size:14px;font-weight:600;padding:12px 32px;border-radius:6px;text-decoration:none;letter-spacing:0.03em;">Leave a review</a>
</td></tr>
<tr><td style="border-top:1px solid #f5ede3;padding:20px 40px 28px;text-align:center;">
  <p style="margin:0;color:#9ca3af;font-size:12px;">You received this because you ordered from {shop}.</p>
</td></tr>`, "#faf7f2"),
  },
];

// ─── Loader ──────────────────────────────────────────────────────────────────

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const anyDb = db as any;

  const defaultSettings = {
    autoApprove: false,
    sendRequestEmail: true,
    requestDelayDays: 7,
    emailSubject: TEMPLATES[0].subject,
    emailBody: TEMPLATES[0].body,
  };
  const settings = await anyDb.reviewSettings?.findUnique?.({ where: { shop } }).catch(() => null) ?? defaultSettings;

  return json({ settings, smtpConfigured: !!process.env.SMTP_HOST });
}

// ─── Action ──────────────────────────────────────────────────────────────────

export async function action({ request }: ActionFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const anyDb = db as any;
  const body = await request.json().catch(() => ({}));

  await anyDb.reviewSettings?.upsert?.({
    where: { shop },
    create: {
      shop,
      autoApprove: !!body.autoApprove,
      sendRequestEmail: !!body.sendRequestEmail,
      requestDelayDays: Number(body.requestDelayDays ?? 7),
      emailSubject: body.emailSubject ?? "",
      emailBody: body.emailBody ?? "",
    },
    update: {
      autoApprove: !!body.autoApprove,
      sendRequestEmail: !!body.sendRequestEmail,
      requestDelayDays: Number(body.requestDelayDays ?? 7),
      emailSubject: body.emailSubject ?? "",
      emailBody: body.emailBody ?? "",
    },
  }).catch(() => null);

  return json({ ok: true });
}

// ─── Scale constants for thumbnail iframes ────────────────────────────────────
const CARD_W = 190;
const CARD_H = 150;
const IFRAME_W = 600;
const SCALE = CARD_W / IFRAME_W;
const IFRAME_H = Math.round(CARD_H / SCALE);

// ─── Component ───────────────────────────────────────────────────────────────

export default function ReviewRequestsPage() {
  const { settings, smtpConfigured } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<any>();

  const [autoApprove, setAutoApprove] = useState(settings.autoApprove ?? false);
  const [sendEmail, setSendEmail] = useState(settings.sendRequestEmail ?? true);
  const [delayDays, setDelayDays] = useState(String(settings.requestDelayDays ?? 7));
  const [subject, setSubject] = useState(settings.emailSubject ?? "");
  const [body, setBody] = useState(settings.emailBody ?? "");
  const [activeTemplate, setActiveTemplate] = useState<string | null>(null);
  const [editingHtml, setEditingHtml] = useState(false);

  const isSaving = fetcher.state !== "idle";
  const saved = fetcher.data?.ok;

  const isHtmlBody = body.trimStart().startsWith("<!DOCTYPE") || body.trimStart().startsWith("<html");

  function applyTemplate(t: typeof TEMPLATES[number]) {
    setSubject(t.subject);
    setBody(t.body);
    setActiveTemplate(t.id);
    setEditingHtml(false);
  }

  function handleSave() {
    fetcher.submit(
      { autoApprove, sendRequestEmail: sendEmail, requestDelayDays: Number(delayDays), emailSubject: subject, emailBody: body },
      { method: "post", encType: "application/json" }
    );
  }

  return (
    <BlockStack gap="500">

      {/* Settings card */}
      <Card>
        <BlockStack gap="400">
          <InlineStack align="space-between" blockAlign="center">
            <BlockStack gap="050">
              <Text as="h2" variant="headingSm">Automation settings</Text>
              <Text as="p" variant="bodySm" tone="subdued">
                Review request emails are sent automatically after every purchase.
              </Text>
            </BlockStack>
            <Button variant="primary" onClick={handleSave} loading={isSaving}>
              {saved && !isSaving ? "Saved ✓" : "Save settings"}
            </Button>
          </InlineStack>

          <Divider />

          <Checkbox
            label="Send review request after purchase"
            helpText="An email is sent to the customer asking for a review after their order."
            checked={sendEmail}
            onChange={setSendEmail}
          />

          {sendEmail && (
            <div style={{ maxWidth: 240 }}>
              <Select
                label="Send email after"
                options={[
                  { label: "3 days", value: "3" },
                  { label: "5 days", value: "5" },
                  { label: "7 days", value: "7" },
                  { label: "10 days", value: "10" },
                  { label: "14 days", value: "14" },
                ]}
                value={delayDays}
                onChange={setDelayDays}
              />
            </div>
          )}

          <Divider />

          <Checkbox
            label="Auto-approve reviews"
            helpText="Reviews publish immediately without manual approval. Turn off to moderate each submission first."
            checked={autoApprove}
            onChange={setAutoApprove}
          />
        </BlockStack>
      </Card>

      {/* Templates */}
      <Card>
        <BlockStack gap="400">
          <BlockStack gap="050">
            <Text as="h2" variant="headingSm">Email templates</Text>
            <Text as="p" variant="bodySm" tone="subdued">
              Pick a template to start from. You can customise the subject below.
            </Text>
          </BlockStack>

          <div style={{ display: "grid", gridTemplateColumns: `repeat(auto-fill, minmax(${CARD_W}px, 1fr))`, gap: 16 }}>
            {TEMPLATES.map((t) => {
              const isActive = activeTemplate === t.id;
              const accentColors: Record<string, string> = { stars: "#4f46e5", grateful: "#f59e0b", vip: "#7c3aed", minimal: "#92765a" };
              const accent = accentColors[t.id] || "#4f46e5";
              return (
                <button
                  key={t.id}
                  onClick={() => applyTemplate(t)}
                  style={{
                    textAlign: "left",
                    border: `2px solid ${isActive ? accent : "#e1e3e5"}`,
                    borderRadius: 10,
                    padding: 0,
                    background: "#fff",
                    cursor: "pointer",
                    overflow: "hidden",
                    transition: "border-color 0.15s, box-shadow 0.15s",
                    boxShadow: isActive ? `0 0 0 3px ${accent}22` : "none",
                  }}
                >
                  {/* Scaled iframe thumbnail */}
                  <div style={{ width: "100%", height: CARD_H, overflow: "hidden", position: "relative", background: "#f6f6f7", pointerEvents: "none" }}>
                    <iframe
                      srcDoc={t.body}
                      title={t.name}
                      scrolling="no"
                      style={{
                        width: IFRAME_W,
                        height: IFRAME_H,
                        border: "none",
                        transform: `scale(${SCALE})`,
                        transformOrigin: "top left",
                        pointerEvents: "none",
                      }}
                    />
                  </div>
                  <div style={{ padding: "10px 14px 12px", borderTop: `3px solid ${accent}` }}>
                    <InlineStack align="space-between" blockAlign="center">
                      <Text as="p" variant="bodySm" fontWeight="semibold">{t.name}</Text>
                      {isActive && <Badge tone="success">Active</Badge>}
                    </InlineStack>
                  </div>
                </button>
              );
            })}
          </div>
        </BlockStack>
      </Card>

      {/* Email editor + preview */}
      <Card>
        <BlockStack gap="400">
          <InlineStack align="space-between" blockAlign="center">
            <BlockStack gap="050">
              <Text as="h2" variant="headingSm">Email subject</Text>
              <Text as="p" variant="bodySm" tone="subdued">
                Variables: <code>{"{name}"}</code> · <code>{"{shop}"}</code> · <code>{"{product}"}</code>
              </Text>
            </BlockStack>
            {isHtmlBody && (
              <Button size="slim" onClick={() => setEditingHtml(!editingHtml)}>
                {editingHtml ? "Show preview" : "Edit HTML"}
              </Button>
            )}
          </InlineStack>

          <TextField
            label="Subject line"
            labelHidden
            value={subject}
            onChange={setSubject}
            autoComplete="off"
            placeholder="How was your order from {shop}?"
          />

          {/* Email body — preview or HTML editor */}
          {isHtmlBody && !editingHtml ? (
            <div>
              <Text as="p" variant="bodySm" tone="subdued">Email preview</Text>
              <div style={{ marginTop: 8, border: "1px solid #e1e3e5", borderRadius: 8, overflow: "hidden" }}>
                <iframe
                  srcDoc={body}
                  title="Email preview"
                  style={{ width: "100%", height: 520, border: "none", display: "block" }}
                />
              </div>
            </div>
          ) : (
            <TextField
              label="Email body"
              value={body}
              onChange={setBody}
              multiline={12}
              autoComplete="off"
              helpText={isHtmlBody ? "Editing raw HTML — click 'Show preview' to see the rendered email" : `Variables: {name} · {shop} · {product} · {review_link}`}
            />
          )}

          {!smtpConfigured && (
            <div style={{ background: "#fff3cd", border: "1px solid #ffc107", borderRadius: 8, padding: "10px 14px" }}>
              <Text as="p" variant="bodySm">
                ⚠️ SMTP not configured — emails won't send until <code>SMTP_HOST</code> is set on Fly.io.
              </Text>
            </div>
          )}
        </BlockStack>
      </Card>

    </BlockStack>
  );
}
