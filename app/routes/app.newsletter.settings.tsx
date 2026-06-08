// app/routes/app.newsletter.settings.tsx
// Newsletter settings — tabbed layout: General, Email, Attribution, Domains, Billing.

import { json, type LoaderFunctionArgs, type ActionFunctionArgs } from "@remix-run/node";
import { useLoaderData, useFetcher } from "@remix-run/react";
import { authenticate } from "~/shopify.server";
import db from "~/db.server";
import {
  Banner, Badge, BlockStack, Button, Card, Checkbox, Divider,
  InlineStack, Page, Select, Text, TextField,
} from "@shopify/polaris";
import { useState } from "react";

// ─── Loader ──────────────────────────────────────────────────────────────────

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const anyDb = db as any;

  const settings = await anyDb.newsletterSettings?.findUnique?.({ where: { shop } }).catch(() => null);

  let domainStatus: "unconfigured" | "ok" | "warning" = "unconfigured";
  const fromEmail = settings?.fromEmail ?? "";
  if (fromEmail && fromEmail.includes("@")) {
    const domain = fromEmail.split("@")[1];
    try {
      const { resolveTxt } = await import("dns/promises");
      const [spfResult] = await Promise.allSettled([
        resolveTxt(domain).then(recs => recs.some(r => r.join("").includes("v=spf1"))),
      ]);
      domainStatus = spfResult.status === "fulfilled" && spfResult.value ? "ok" : "warning";
    } catch {
      domainStatus = "warning";
    }
  }

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const sentCampaigns = await anyDb.newsletterCampaign?.findMany?.({
    where: { shop, status: "sent", sentAt: { gte: monthStart, lt: monthEnd } },
    select: { recipientCount: true },
  }).catch(() => [] as Array<{ recipientCount: number }>);
  const emailsSentThisMonth: number = (sentCampaigns ?? []).reduce(
    (s: number, c: { recipientCount: number }) => s + (c.recipientCount ?? 0), 0
  );
  const monthlyEmailLimit: number = settings?.monthlyEmailLimit ?? 2500;

  return json({
    settings: settings ?? { fromName: "", fromEmail: "", replyTo: "", footerText: "", monthlyEmailLimit: 2500 },
    domainStatus,
    smtpConfigured: !!process.env.SMTP_HOST,
    emailsSentThisMonth,
    monthlyEmailLimit,
    shop,
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
    create: { shop, fromName: body.fromName ?? "", fromEmail: body.fromEmail ?? "", replyTo: body.replyTo ?? "", footerText: body.footerText ?? "" },
    update: { fromName: body.fromName ?? "", fromEmail: body.fromEmail ?? "", replyTo: body.replyTo ?? "", footerText: body.footerText ?? "" },
  }).catch(() => null);

  return json({ ok: true });
}

// ─── Tab nav ─────────────────────────────────────────────────────────────────

type Tab = "General" | "Email" | "Attribution" | "Domains" | "Notifications" | "Integrations" | "Billing";
const TABS: Tab[] = ["General", "Email", "Attribution", "Domains", "Notifications", "Integrations", "Billing"];

function TabBar({ active, onChange }: { active: Tab; onChange: (t: Tab) => void }) {
  return (
    <div style={{ display: "flex", gap: 0, borderBottom: "1px solid #E5E7EB", marginBottom: 24 }}>
      {TABS.map(t => (
        <button key={t} onClick={() => onChange(t)} style={{
          padding: "10px 18px", border: "none", background: "transparent", cursor: "pointer",
          fontSize: 13, fontWeight: 600,
          color: t === active ? "#008060" : "#6B7280",
          borderBottom: t === active ? "2px solid #008060" : "2px solid transparent",
          marginBottom: -1,
        }}>{t}</button>
      ))}
    </div>
  );
}

function StubTab({ name }: { name: string }) {
  return (
    <Card>
      <div style={{ padding: "48px 0", textAlign: "center" }}>
        <Text as="p" variant="headingMd">{name}</Text>
        <div style={{ marginTop: 8 }}>
          <Text as="p" variant="bodySm" tone="subdued">
            {name} settings will be available in an upcoming update.
          </Text>
        </div>
      </div>
    </Card>
  );
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function NewsletterSettingsPage() {
  const { settings, domainStatus, smtpConfigured, emailsSentThisMonth, monthlyEmailLimit, shop } =
    useLoaderData<typeof loader>();
  const fetcher = useFetcher<any>();

  const [activeTab, setActiveTab] = useState<Tab>("General");

  // Sender identity fields
  const [fromName, setFromName] = useState(settings.fromName ?? "");
  const [fromEmail, setFromEmail] = useState(settings.fromEmail ?? "");
  const [replyTo, setReplyTo] = useState(settings.replyTo ?? "");
  const [footerText, setFooterText] = useState(settings.footerText ?? "");

  // General tab extra fields (UI-only for now, saved via footerText + fromEmail)
  const [storeName, setStoreName] = useState(shop.replace(".myshopify.com", ""));
  const [brandColor, setBrandColor] = useState("#16A34A");
  const [doubleOptIn, setDoubleOptIn] = useState(true);
  const [allowResubscribe, setAllowResubscribe] = useState(true);
  const [trackOpens, setTrackOpens] = useState(true);
  const [trackClicks, setTrackClicks] = useState(true);
  const [trackUtm, setTrackUtm] = useState(true);
  const [showUnsubscribeLink, setShowUnsubscribeLink] = useState(true);
  const [physicalAddress, setPhysicalAddress] = useState("");
  const [useCustomReplyTo, setUseCustomReplyTo] = useState(!!settings.replyTo);

  const isSaving = fetcher.state !== "idle";
  const saved = fetcher.data?.ok && !isSaving;
  const senderUnconfigured = !fromEmail || !fromName;
  const domainFromEmail = fromEmail.includes("@") ? fromEmail.split("@")[1] : null;

  function handleSave() {
    fetcher.submit(
      { fromName, fromEmail, replyTo: useCustomReplyTo ? replyTo : "", footerText },
      { method: "post", encType: "application/json" }
    );
  }

  return (
    <Page
      title="Settings"
      subtitle="Manage your preferences, email settings and attribution."
      primaryAction={{ content: saved ? "Saved ✓" : isSaving ? "Saving…" : "Save changes", onAction: handleSave, loading: isSaving }}
    >
      <BlockStack gap="0">
        <TabBar active={activeTab} onChange={setActiveTab} />

        {/* ── GENERAL ──────────────────────────────────────────────── */}
        {activeTab === "General" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 20, alignItems: "start" }}>

            {/* Column 1 */}
            <BlockStack gap="400">
              {/* Store information */}
              <Card>
                <BlockStack gap="400">
                  <Text as="h2" variant="headingSm" fontWeight="semibold">Store information</Text>
                  <TextField label="Store name" value={storeName} onChange={setStoreName} autoComplete="off" helpText="Used as the default sender name." />
                  <TextField label="Store email" value={fromEmail} onChange={setFromEmail} type="email" autoComplete="email" helpText="This email will be used as the default sender email." />
                  <Select label="Store timezone" options={[
                    { label: "(GMT+01:00) Oslo, Stockholm, Copenhagen", value: "Europe/Oslo" },
                    { label: "(GMT+00:00) London", value: "Europe/London" },
                    { label: "(GMT-05:00) New York", value: "America/New_York" },
                    { label: "(GMT-08:00) Los Angeles", value: "America/Los_Angeles" },
                    { label: "(GMT+01:00) Paris, Berlin", value: "Europe/Paris" },
                  ]} value="Europe/Oslo" onChange={() => {}} helpText="Timezone is used for scheduling and reporting." />
                </BlockStack>
              </Card>

              {/* Default from details */}
              <Card>
                <BlockStack gap="400">
                  <Text as="h2" variant="headingSm" fontWeight="semibold">Default from details</Text>
                  <TextField label="From name" value={fromName} onChange={setFromName} autoComplete="name" placeholder="Your Store Name" />
                  <TextField label="From email" value={fromEmail} onChange={setFromEmail} type="email" autoComplete="email" placeholder="hello@yourstore.com" helpText="This will be the default sender for your emails." />
                  <Checkbox label="Use custom reply-to email" checked={useCustomReplyTo} onChange={setUseCustomReplyTo} />
                  {useCustomReplyTo && (
                    <TextField label="Reply-to email" value={replyTo} onChange={setReplyTo} type="email" autoComplete="email" placeholder="support@yourstore.com" helpText="Replies to your emails will go to this address." />
                  )}
                </BlockStack>
              </Card>
            </BlockStack>

            {/* Column 2 */}
            <BlockStack gap="400">
              {/* Branding */}
              <Card>
                <BlockStack gap="400">
                  <Text as="h2" variant="headingSm" fontWeight="semibold">Branding</Text>
                  <BlockStack gap="200">
                    <Text as="p" variant="bodySm" tone="subdued">Logo</Text>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <div style={{ width: 64, height: 64, borderRadius: 10, background: "#F3F4F6", border: "1px solid #E5E7EB", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <span style={{ fontSize: 22, color: "#9CA3AF" }}>🏪</span>
                      </div>
                      <Button size="slim">Change logo</Button>
                    </div>
                    <Text as="p" variant="bodySm" tone="subdued">Recommended size: 200 x 60px (PNG or SVG)</Text>
                  </BlockStack>

                  <BlockStack gap="100">
                    <Text as="p" variant="bodySm">Brand color</Text>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <input type="color" value={brandColor} onChange={e => setBrandColor(e.target.value)}
                        style={{ width: 36, height: 36, borderRadius: 6, border: "1px solid #E5E7EB", padding: 2, cursor: "pointer" }} />
                      <div style={{ flex: 1 }}>
                        <input value={brandColor} onChange={e => setBrandColor(e.target.value)}
                          style={{ width: "100%", padding: "7px 10px", border: "1px solid #E5E7EB", borderRadius: 6, fontSize: 13, fontFamily: "monospace" }} />
                      </div>
                    </div>
                    <Text as="p" variant="bodySm" tone="subdued">This color will be used for buttons and links.</Text>
                  </BlockStack>

                  <TextField label="Email footer text" value={footerText} onChange={setFooterText} multiline={3} autoComplete="off" placeholder={"© {year}} Demo Store. All rights reserved.\n123 Example Street, Oslo, Norway"} helpText="This will appear in the footer of your emails." />
                </BlockStack>
              </Card>

              {/* Tracking settings */}
              <Card>
                <BlockStack gap="400">
                  <Text as="h2" variant="headingSm" fontWeight="semibold">Tracking settings</Text>
                  <Checkbox label="Track opens" checked={trackOpens} onChange={setTrackOpens} helpText="Measure when subscribers open your emails." />
                  <Checkbox label="Track clicks" checked={trackClicks} onChange={setTrackClicks} helpText="Measure clicks on links in your emails." />
                  <Checkbox label="Use UTM parameters" checked={trackUtm} onChange={setTrackUtm} helpText="Add UTM parameters to links for better attribution." />
                  <Select label="Google Analytics" options={[{ label: "None", value: "" }, { label: "GA4 (G-123456789)", value: "ga4" }]} value="" onChange={() => {}} helpText="Track email traffic in Google Analytics." />
                </BlockStack>
              </Card>
            </BlockStack>

            {/* Column 3 */}
            <BlockStack gap="400">
              {/* List settings */}
              <Card>
                <BlockStack gap="400">
                  <Text as="h2" variant="headingSm" fontWeight="semibold">List settings</Text>
                  <TextField label="Default list name" value="Newsletter Subscribers" onChange={() => {}} autoComplete="off" helpText="New subscribers will be added to this list by default." />

                  <BlockStack gap="200">
                    <Text as="p" variant="bodySm" fontWeight="semibold">Double opt-in</Text>
                    {[
                      { label: "Enabled (recommended)", desc: "Subscribers must confirm their email address.", value: true },
                      { label: "Disabled", desc: "Subscribers are added immediately.", value: false },
                    ].map(opt => (
                      <label key={String(opt.value)} style={{ display: "flex", gap: 10, cursor: "pointer" }}>
                        <input type="radio" name="optin" checked={doubleOptIn === opt.value} onChange={() => setDoubleOptIn(opt.value)}
                          style={{ marginTop: 2, accentColor: "#008060" }} />
                        <BlockStack gap="0">
                          <Text as="p" variant="bodySm" fontWeight="semibold">{opt.label}</Text>
                          <Text as="p" variant="bodySm" tone="subdued">{opt.desc}</Text>
                        </BlockStack>
                      </label>
                    ))}
                  </BlockStack>

                  <Checkbox label="Allow unsubscribed contacts to resubscribe" checked={allowResubscribe} onChange={setAllowResubscribe} helpText="Unsubscribed contacts will be able to subscribe again." />

                  <Select label="Unsubscribe page" options={[{ label: "Default Attribix page", value: "default" }]} value="default" onChange={() => {}} helpText="Choose the page your subscribers see after unsubscribing." />
                </BlockStack>
              </Card>

              {/* Compliance */}
              <Card>
                <BlockStack gap="400">
                  <Text as="h2" variant="headingSm" fontWeight="semibold">Compliance</Text>
                  <Checkbox label="Show unsubscribe link" checked={showUnsubscribeLink} onChange={setShowUnsubscribeLink} helpText="Required by law in all marketing emails." />
                  <Checkbox label="Add physical address to footer" checked helpText="Required for CAN-SPAM compliance." onChange={() => {}} />
                  <TextField label="Physical address" value={physicalAddress} onChange={setPhysicalAddress} autoComplete="off" placeholder="123 Example Street, Oslo, Norway" helpText="This address will appear in the footer of your emails." />
                </BlockStack>
              </Card>

              {/* Monthly usage */}
              <Card>
                <BlockStack gap="300">
                  <InlineStack align="space-between" blockAlign="center">
                    <Text as="h2" variant="headingSm" fontWeight="semibold">Monthly email usage</Text>
                    <Badge tone={emailsSentThisMonth >= monthlyEmailLimit ? "critical" : emailsSentThisMonth >= monthlyEmailLimit * 0.8 ? "warning" : "success"}>
                      {`${emailsSentThisMonth.toLocaleString()} / ${monthlyEmailLimit.toLocaleString()}`}
                    </Badge>
                  </InlineStack>
                  <div style={{ background: "#F3F4F6", borderRadius: 6, height: 8, overflow: "hidden" }}>
                    <div style={{
                      height: "100%",
                      width: `${Math.min(100, Math.round((emailsSentThisMonth / monthlyEmailLimit) * 100))}%`,
                      background: emailsSentThisMonth >= monthlyEmailLimit ? "#dc2626" : emailsSentThisMonth >= monthlyEmailLimit * 0.8 ? "#f59e0b" : "#16a34a",
                      borderRadius: 6, transition: "width 0.3s",
                    }} />
                  </div>
                  <Text as="p" variant="bodySm" tone="subdued">
                    {Math.max(0, monthlyEmailLimit - emailsSentThisMonth).toLocaleString()} emails remaining this month.
                  </Text>
                </BlockStack>
              </Card>
            </BlockStack>
          </div>
        )}

        {/* ── EMAIL ────────────────────────────────────────────────── */}
        {activeTab === "Email" && (
          <BlockStack gap="400">
            {senderUnconfigured && (
              <Banner tone="warning" title="Sender identity not configured">
                <Text as="p">Set a From name and From email address. All sending will fail until these are configured.</Text>
              </Banner>
            )}
            {!smtpConfigured && (
              <Banner tone="critical" title="Email sending disabled">
                <Text as="p">SMTP is not configured. Contact support to enable email delivery.</Text>
              </Banner>
            )}

            <Card>
              <BlockStack gap="400">
                <BlockStack gap="050">
                  <Text as="h2" variant="headingSm" fontWeight="semibold">Sender identity</Text>
                  <Text as="p" variant="bodySm" tone="subdued">These defaults pre-fill every new campaign. You can override them per campaign.</Text>
                </BlockStack>
                <Divider />
                <InlineStack gap="400" wrap>
                  <div style={{ flex: 1, minWidth: 220 }}>
                    <TextField label="From name" value={fromName} onChange={setFromName} autoComplete="name" placeholder="Your Store Name" helpText="The name subscribers see in their inbox" />
                  </div>
                  <div style={{ flex: 1, minWidth: 220 }}>
                    <TextField label="From email address" value={fromEmail} onChange={setFromEmail} autoComplete="email" type="email" placeholder="hello@yourstore.com" helpText="Must be an email address on a domain you own" />
                  </div>
                </InlineStack>
                <div style={{ maxWidth: 400 }}>
                  <TextField label="Reply-to address (optional)" value={replyTo} onChange={setReplyTo} autoComplete="email" type="email" placeholder="support@yourstore.com" helpText="Where replies go — can differ from the from address" />
                </div>
              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="300">
                <BlockStack gap="050">
                  <Text as="h2" variant="headingSm" fontWeight="semibold">Email footer</Text>
                  <Text as="p" variant="bodySm" tone="subdued">Appears at the bottom of every campaign above the unsubscribe link.</Text>
                </BlockStack>
                <TextField label="Footer text" labelHidden value={footerText} onChange={setFooterText} multiline={3} autoComplete="off" placeholder="123 Main St, Oslo, Norway · hello@yourstore.com" />
                <Text as="p" variant="bodySm" tone="subdued">💡 Including your physical address is legally required in many countries (CAN-SPAM, GDPR).</Text>
              </BlockStack>
            </Card>
          </BlockStack>
        )}

        {/* ── DOMAINS ──────────────────────────────────────────────── */}
        {activeTab === "Domains" && (
          <BlockStack gap="400">
            <Card>
              <BlockStack gap="300">
                <InlineStack align="space-between" blockAlign="center">
                  <BlockStack gap="050">
                    <Text as="h2" variant="headingSm" fontWeight="semibold">Sender domain health</Text>
                    <Text as="p" variant="bodySm" tone="subdued">Proper DNS records ensure your emails land in the inbox, not spam.</Text>
                  </BlockStack>
                  {domainStatus === "ok" && <Badge tone="success">✓ Looks good</Badge>}
                  {domainStatus === "warning" && <Badge tone="warning">Action needed</Badge>}
                  {domainStatus === "unconfigured" && <Badge tone="attention">Set a from email first</Badge>}
                </InlineStack>

                {domainStatus === "warning" && domainFromEmail && (
                  <Banner tone="warning">
                    <BlockStack gap="200">
                      <Text as="p" variant="bodyMd" fontWeight="semibold">SPF record not detected for {domainFromEmail}</Text>
                      <Text as="p" variant="bodySm">Without SPF, your emails may be marked as spam. Add this TXT record to your DNS:</Text>
                      <div style={{ background: "#fff", borderRadius: 6, padding: "8px 14px", fontFamily: "monospace", fontSize: 12, border: "1px solid #fcd34d" }}>
                        <div style={{ color: "#6b7280", marginBottom: 4 }}>Host: {domainFromEmail}</div>
                        <div>v=spf1 include:attribix-app.fly.dev ~all</div>
                      </div>
                    </BlockStack>
                  </Banner>
                )}

                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px,1fr))", gap: 12 }}>
                  {[
                    { label: "SPF record", desc: "Authorises your sending server", status: domainStatus === "ok" ? "ok" : domainStatus === "warning" ? "warn" : "none", tip: `v=spf1 include:attribix-app.fly.dev ~all` },
                    { label: "DKIM signing", desc: "Cryptographic email signature", status: "info", tip: "Managed by your SMTP provider" },
                    { label: "DMARC policy", desc: "Protects your domain from spoofing", status: "info", tip: `v=DMARC1; p=none; rua=mailto:${fromEmail || "you@domain.com"}` },
                  ].map(({ label, desc, status, tip }) => (
                    <div key={label} style={{ border: `1.5px solid ${status === "ok" ? "#86efac" : status === "warn" ? "#fcd34d" : "#e5e7eb"}`, borderRadius: 8, padding: "12px 14px", background: status === "ok" ? "#f0fdf4" : status === "warn" ? "#fffbeb" : "#f9fafb" }}>
                      <InlineStack gap="100" blockAlign="center">
                        <span style={{ fontSize: 14 }}>{status === "ok" ? "✅" : status === "warn" ? "⚠️" : "ℹ️"}</span>
                        <Text as="p" variant="bodySm" fontWeight="semibold">{label}</Text>
                      </InlineStack>
                      <Text as="p" variant="bodySm" tone="subdued">{desc}</Text>
                      {tip && <div style={{ marginTop: 8, fontFamily: "monospace", fontSize: 10, color: "#6b7280", wordBreak: "break-all" }}>{tip}</div>}
                    </div>
                  ))}
                </div>
              </BlockStack>
            </Card>
          </BlockStack>
        )}

        {/* ── ATTRIBUTION ──────────────────────────────────────────── */}
        {activeTab === "Attribution" && <StubTab name="Attribution" />}
        {activeTab === "Notifications" && <StubTab name="Notifications" />}
        {activeTab === "Integrations" && <StubTab name="Integrations" />}

        {/* ── BILLING ──────────────────────────────────────────────── */}
        {activeTab === "Billing" && (
          <BlockStack gap="400">
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingSm" fontWeight="semibold">Current plan</Text>
                <InlineStack align="space-between" blockAlign="center">
                  <BlockStack gap="050">
                    <Text as="p" variant="bodyMd" fontWeight="semibold">Starter</Text>
                    <Text as="p" variant="bodySm" tone="subdued">2,500 emails / month · 1,000 subscribers</Text>
                  </BlockStack>
                  <Button>Upgrade plan</Button>
                </InlineStack>
                <Divider />
                <InlineStack align="space-between" blockAlign="center">
                  <Text as="p" variant="bodySm" tone="subdued">Emails sent this month</Text>
                  <Badge tone={emailsSentThisMonth >= monthlyEmailLimit ? "critical" : "success"}>
                    {`${emailsSentThisMonth.toLocaleString()} / ${monthlyEmailLimit.toLocaleString()}`}
                  </Badge>
                </InlineStack>
              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingSm" fontWeight="semibold" tone="critical">Danger zone</Text>
                <Text as="p" variant="bodySm" tone="subdued">These actions are permanent and cannot be undone.</Text>
                <Divider />
                <InlineStack>
                  <Button tone="critical" variant="plain">Disconnect app</Button>
                </InlineStack>
              </BlockStack>
            </Card>
          </BlockStack>
        )}
      </BlockStack>
    </Page>
  );
}
