// app/routes/app.newsletter.settings.tsx
// Newsletter sender settings — default from name/email, reply-to, footer text.
// These pre-fill every new campaign.

import { json, type LoaderFunctionArgs, type ActionFunctionArgs } from "@remix-run/node";
import { useLoaderData, useFetcher } from "@remix-run/react";
import { authenticate } from "~/shopify.server";
import db from "~/db.server";
import {
  Card, BlockStack, InlineStack, Text, TextField, Button, Banner, Divider, Badge,
} from "@shopify/polaris";
import { useState } from "react";

// ─── Loader ──────────────────────────────────────────────────────────────────

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const anyDb = db as any;

  const settings = await anyDb.newsletterSettings?.findUnique?.({ where: { shop } }).catch(() => null);

  // Check domain health via DNS lookup (server-side)
  let domainStatus: "unconfigured" | "ok" | "warning" = "unconfigured";
  const fromEmail = settings?.fromEmail ?? "";
  if (fromEmail && fromEmail.includes("@")) {
    const domain = fromEmail.split("@")[1];
    try {
      const { resolveTxt } = await import("dns/promises");
      const [spfRecords, dkimRecords] = await Promise.allSettled([
        resolveTxt(domain).then(recs => recs.some(r => r.join("").includes("v=spf1"))),
        resolveTxt(`default._domainkey.${domain}`).then(() => true).catch(() => false),
      ]);
      const hasSPF = spfRecords.status === "fulfilled" && spfRecords.value;
      domainStatus = hasSPF ? "ok" : "warning";
    } catch {
      domainStatus = "warning";
    }
  }

  // Monthly send usage
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  const sentCampaigns = await anyDb.newsletterCampaign?.findMany?.({
    where: {
      shop,
      status: "sent",
      sentAt: { gte: monthStart, lt: monthEnd },
    },
    select: { recipientCount: true },
  }).catch(() => [] as Array<{ recipientCount: number }>);

  const emailsSentThisMonth: number = (sentCampaigns ?? []).reduce(
    (sum: number, c: { recipientCount: number }) => sum + (c.recipientCount ?? 0),
    0
  );
  const monthlyEmailLimit: number = settings?.monthlyEmailLimit ?? 500;

  return json({
    settings: settings ?? { fromName: "", fromEmail: "", replyTo: "", footerText: "", monthlyEmailLimit: 500 },
    domainStatus,
    smtpConfigured: !!process.env.SMTP_HOST,
    emailsSentThisMonth,
    monthlyEmailLimit,
  });
}

// ─── Action ──────────────────────────────────────────────────────────────────

export async function action({ request }: ActionFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const anyDb = db as any;
  const body = await request.json().catch(() => ({}));

  await anyDb.newsletterSettings?.upsert?.({
    where: { shop },
    create: {
      shop,
      fromName: body.fromName ?? "",
      fromEmail: body.fromEmail ?? "",
      replyTo: body.replyTo ?? "",
      footerText: body.footerText ?? "",
    },
    update: {
      fromName: body.fromName ?? "",
      fromEmail: body.fromEmail ?? "",
      replyTo: body.replyTo ?? "",
      footerText: body.footerText ?? "",
    },
  }).catch(() => null);

  return json({ ok: true });
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function NewsletterSettingsPage() {
  const { settings, domainStatus, smtpConfigured, emailsSentThisMonth, monthlyEmailLimit } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<any>();

  const [fromName, setFromName] = useState(settings.fromName ?? "");
  const [fromEmail, setFromEmail] = useState(settings.fromEmail ?? "");
  const [replyTo, setReplyTo] = useState(settings.replyTo ?? "");
  const [footerText, setFooterText] = useState(settings.footerText ?? "");

  const isSaving = fetcher.state !== "idle";
  const saved = fetcher.data?.ok;

  function handleSave() {
    fetcher.submit(
      { fromName, fromEmail, replyTo, footerText },
      { method: "post", encType: "application/json" }
    );
  }

  const domainFromEmail = fromEmail.includes("@") ? fromEmail.split("@")[1] : null;

  return (
    <BlockStack gap="500">

      {/* Sender identity */}
      <Card>
        <BlockStack gap="400">
          <InlineStack align="space-between" blockAlign="center">
            <BlockStack gap="050">
              <Text as="h2" variant="headingSm">Sender identity</Text>
              <Text as="p" variant="bodySm" tone="subdued">
                These defaults pre-fill every new campaign. You can override them per campaign.
              </Text>
            </BlockStack>
            <Button
              variant="primary"
              onClick={handleSave}
              loading={isSaving}
            >
              {saved && !isSaving ? "Saved ✓" : "Save settings"}
            </Button>
          </InlineStack>

          <Divider />

          <InlineStack gap="400" wrap>
            <div style={{ flex: 1, minWidth: 220 }}>
              <TextField
                label="From name"
                value={fromName}
                onChange={setFromName}
                autoComplete="name"
                placeholder="Your Store Name"
                helpText="The name subscribers see in their inbox"
              />
            </div>
            <div style={{ flex: 1, minWidth: 220 }}>
              <TextField
                label="From email address"
                value={fromEmail}
                onChange={setFromEmail}
                autoComplete="email"
                type="email"
                placeholder="hello@yourstore.com"
                helpText="Must be an email address on a domain you own"
              />
            </div>
          </InlineStack>

          <div style={{ maxWidth: 400 }}>
            <TextField
              label="Reply-to address (optional)"
              value={replyTo}
              onChange={setReplyTo}
              autoComplete="email"
              type="email"
              placeholder="support@yourstore.com"
              helpText="Where replies go — can differ from the from address"
            />
          </div>
        </BlockStack>
      </Card>

      {/* Domain health */}
      <Card>
        <BlockStack gap="300">
          <InlineStack align="space-between" blockAlign="center">
            <BlockStack gap="050">
              <Text as="h2" variant="headingSm">Sender domain health</Text>
              <Text as="p" variant="bodySm" tone="subdued">
                Proper DNS records ensure your emails land in the inbox, not spam.
              </Text>
            </BlockStack>
            {domainStatus === "ok" && <Badge tone="success">✓ Looks good</Badge>}
            {domainStatus === "warning" && <Badge tone="warning">Action needed</Badge>}
            {domainStatus === "unconfigured" && <Badge tone="attention">Set a from email first</Badge>}
          </InlineStack>

          {domainStatus === "warning" && domainFromEmail && (
            <Banner tone="warning">
              <BlockStack gap="200">
                <Text as="p" variant="bodyMd" fontWeight="semibold">
                  SPF record not detected for {domainFromEmail}
                </Text>
                <Text as="p" variant="bodySm">
                  Without SPF, your emails may be marked as spam. Add this TXT record to your domain's DNS:
                </Text>
                <div style={{ background: "#fff", borderRadius: 6, padding: "8px 14px", fontFamily: "monospace", fontSize: 12, border: "1px solid #fcd34d" }}>
                  <div style={{ color: "#6b7280", marginBottom: 4 }}>Host: {domainFromEmail}</div>
                  <div>v=spf1 include:attribix-app.fly.dev ~all</div>
                </div>
              </BlockStack>
            </Banner>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px,1fr))", gap: 12 }}>
            {[
              {
                label: "SPF record",
                desc: "Authorises your sending server",
                status: domainStatus === "ok" ? "ok" : domainStatus === "warning" ? "warn" : "none",
                tip: `v=spf1 include:attribix-app.fly.dev ~all`,
              },
              {
                label: "DKIM signing",
                desc: "Cryptographic email signature",
                status: "info",
                tip: "Managed by your SMTP provider",
              },
              {
                label: "DMARC policy",
                desc: "Protects your domain from spoofing",
                status: "info",
                tip: `v=DMARC1; p=none; rua=mailto:${fromEmail || "you@domain.com"}`,
              },
            ].map(({ label, desc, status, tip }) => (
              <div key={label} style={{
                border: `1.5px solid ${status === "ok" ? "#86efac" : status === "warn" ? "#fcd34d" : "#e5e7eb"}`,
                borderRadius: 8, padding: "12px 14px",
                background: status === "ok" ? "#f0fdf4" : status === "warn" ? "#fffbeb" : "#f9fafb",
              }}>
                <InlineStack gap="100" blockAlign="center">
                  <span style={{ fontSize: 14 }}>
                    {status === "ok" ? "✅" : status === "warn" ? "⚠️" : "ℹ️"}
                  </span>
                  <Text as="p" variant="bodySm" fontWeight="semibold">{label}</Text>
                </InlineStack>
                <Text as="p" variant="bodySm" tone="subdued">{desc}</Text>
                {tip && (
                  <div style={{ marginTop: 8, fontFamily: "monospace", fontSize: 10, color: "#6b7280", wordBreak: "break-all" }}>
                    {tip}
                  </div>
                )}
              </div>
            ))}
          </div>
        </BlockStack>
      </Card>

      {/* Email footer */}
      <Card>
        <BlockStack gap="300">
          <BlockStack gap="050">
            <Text as="h2" variant="headingSm">Email footer</Text>
            <Text as="p" variant="bodySm" tone="subdued">
              Appears at the bottom of every campaign above the unsubscribe link. Good for your address or a short tagline.
            </Text>
          </BlockStack>
          <TextField
            label="Footer text"
            labelHidden
            value={footerText}
            onChange={setFooterText}
            autoComplete="off"
            multiline={3}
            placeholder="123 Main St, Oslo, Norway · hello@yourstore.com"
          />
          <Text as="p" variant="bodySm" tone="subdued">
            💡 Including your physical address is legally required in many countries (CAN-SPAM, GDPR).
          </Text>
        </BlockStack>
      </Card>

      {/* Monthly send usage */}
      <Card>
        <BlockStack gap="300">
          <BlockStack gap="050">
            <Text as="h2" variant="headingSm">Monthly email usage</Text>
            <Text as="p" variant="bodySm" tone="subdued">
              Resets on the 1st of each month.
            </Text>
          </BlockStack>
          <InlineStack align="space-between" blockAlign="center">
            <Text as="p" variant="bodyMd">
              Emails sent this month
            </Text>
            <Badge tone={emailsSentThisMonth >= monthlyEmailLimit ? "critical" : emailsSentThisMonth >= monthlyEmailLimit * 0.8 ? "warning" : "success"}>
              {emailsSentThisMonth} / {monthlyEmailLimit}
            </Badge>
          </InlineStack>
          <div style={{ background: "#f3f4f6", borderRadius: 6, height: 8, overflow: "hidden" }}>
            <div style={{
              height: "100%",
              width: `${Math.min(100, Math.round((emailsSentThisMonth / monthlyEmailLimit) * 100))}%`,
              background: emailsSentThisMonth >= monthlyEmailLimit ? "#dc2626" : emailsSentThisMonth >= monthlyEmailLimit * 0.8 ? "#f59e0b" : "#10b981",
              borderRadius: 6,
              transition: "width 0.3s ease",
            }} />
          </div>
          <Text as="p" variant="bodySm" tone="subdued">
            {Math.max(0, monthlyEmailLimit - emailsSentThisMonth)} emails remaining this month.
            {emailsSentThisMonth >= monthlyEmailLimit * 0.8 && emailsSentThisMonth < monthlyEmailLimit
              ? " You're approaching your limit — consider upgrading your plan."
              : emailsSentThisMonth >= monthlyEmailLimit
              ? " Limit reached. Upgrade your plan to send more campaigns this month."
              : ""}
          </Text>
        </BlockStack>
      </Card>

      {/* SMTP status */}
      {!smtpConfigured && (
        <Banner tone="warning" title="Email sending not configured">
          <Text as="p">
            Add <code>SMTP_HOST</code>, <code>SMTP_USER</code>, and <code>SMTP_PASS</code> to your Fly.io secrets to enable sending.
            Your sender settings here will be saved and applied as soon as SMTP is configured.
          </Text>
        </Banner>
      )}

    </BlockStack>
  );
}
