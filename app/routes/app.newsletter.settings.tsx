// app/routes/app.newsletter.settings.tsx
// Newsletter settings — tabbed layout: General, Email, Attribution, Domains, Billing.

import { json, type LoaderFunctionArgs, type ActionFunctionArgs } from "@remix-run/node";
import { useLoaderData, useFetcher } from "@remix-run/react";
import { authenticate } from "~/shopify.server";
import db from "~/db.server";
import {
  createResendDomain,
  getResendDomain,
  verifyResendDomain,
  deleteResendDomain,
} from "~/services/resend-api.server";
import {
  Banner, Badge, BlockStack, Button, Card, Checkbox, Divider,
  InlineStack, Page, Select, Text, TextField,
} from "@shopify/polaris";
import { useState, useCallback, useEffect } from "react";

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
    settings: settings ?? { fromName: "", fromEmail: "", replyTo: "", footerText: "", monthlyEmailLimit: 2500, resendDomainId: null, resendDomainStatus: null, resendDomainRecords: null },
    domainStatus,
    smtpConfigured: !!process.env.SMTP_HOST,
    envFromEmail: process.env.SMTP_FROM_EMAIL || "",
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
  const { intent } = body as { intent?: string };

  const settings = await anyDb.newsletterSettings?.findUnique?.({ where: { shop } }).catch(() => null);

  // ── Domain: register ────────────────────────────────────────────────────
  if (intent === "domain_register") {
    const fe: string = body.fromEmail || settings?.fromEmail || "";
    if (!fe || !fe.includes("@")) {
      return json({ ok: false, error: "Enter a valid From email address first." });
    }
    const domain = fe.split("@")[1].toLowerCase();

    if (settings?.resendDomainId) {
      const existing = await getResendDomain(settings.resendDomainId);
      if (existing.ok && existing.domain.name === domain) {
        return json({ ok: true, domain: existing.domain });
      }
      await deleteResendDomain(settings.resendDomainId).catch(() => null);
    }

    const result = await createResendDomain(domain);
    if (!result.ok) return json({ ok: false, error: result.error });

    await anyDb.newsletterSettings?.upsert?.({
      where: { shop },
      create: {
        shop,
        fromEmail: settings?.fromEmail ?? "",
        fromName: settings?.fromName ?? "",
        replyTo: settings?.replyTo ?? "",
        footerText: settings?.footerText ?? "",
        resendDomainId: result.domain.id,
        resendDomainStatus: result.domain.status,
        resendDomainRecords: result.domain.records,
      },
      update: {
        resendDomainId: result.domain.id,
        resendDomainStatus: result.domain.status,
        resendDomainRecords: result.domain.records,
      },
    }).catch(() => null);

    return json({ ok: true, domain: result.domain });
  }

  // ── Domain: verify ──────────────────────────────────────────────────────
  if (intent === "domain_verify") {
    if (!settings?.resendDomainId) {
      return json({ ok: false, error: "No domain registered yet." });
    }
    const result = await verifyResendDomain(settings.resendDomainId);
    if (!result.ok) return json({ ok: false, error: result.error });

    await anyDb.newsletterSettings?.update?.({
      where: { shop },
      data: {
        resendDomainStatus: result.domain.status,
        resendDomainRecords: result.domain.records,
      },
    }).catch(() => null);

    return json({ ok: true, domain: result.domain });
  }

  // ── Domain: remove ──────────────────────────────────────────────────────
  if (intent === "domain_remove") {
    if (settings?.resendDomainId) {
      await deleteResendDomain(settings.resendDomainId).catch(() => null);
    }
    await anyDb.newsletterSettings?.update?.({
      where: { shop },
      data: { resendDomainId: null, resendDomainStatus: null, resendDomainRecords: null },
    }).catch(() => null);

    return json({ ok: true, removed: true });
  }

  // ── Default: save settings ──────────────────────────────────────────────
  await anyDb.newsletterSettings?.upsert?.({
    where: { shop },
    create: { shop, fromName: body.fromName ?? "", fromEmail: body.fromEmail ?? "", replyTo: body.replyTo ?? "", footerText: body.footerText ?? "" },
    update: { fromName: body.fromName ?? "", fromEmail: body.fromEmail ?? "", replyTo: body.replyTo ?? "", footerText: body.footerText ?? "" },
  }).catch(() => null);

  return json({ ok: true });
}

// ─── Tab nav ─────────────────────────────────────────────────────────────────

type Tab = "General" | "Email" | "Domains" | "Billing";
const TABS: Tab[] = ["General", "Email", "Domains", "Billing"];

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

// ─── Copy cell ───────────────────────────────────────────────────────────────

function CopyCell({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <span style={{ fontFamily: "monospace", fontSize: 11, wordBreak: "break-all" }}>{value}</span>
      <button
        onClick={() => { navigator.clipboard.writeText(value).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }); }}
        style={{ flexShrink: 0, padding: "2px 8px", fontSize: 11, border: "1px solid #d1d5db", borderRadius: 4, background: copied ? "#dcfce7" : "#f9fafb", cursor: "pointer", color: copied ? "#166534" : "#374151" }}
      >
        {copied ? "Copied!" : "Copy"}
      </button>
    </div>
  );
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function NewsletterSettingsPage() {
  const { settings, domainStatus, smtpConfigured, envFromEmail, emailsSentThisMonth, monthlyEmailLimit, shop } =
    useLoaderData<typeof loader>();
  const fetcher = useFetcher<any>();
  const domainFetcher = useFetcher<any>();

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

  // Domain verification state
  const [domainData, setDomainData] = useState<any>(
    settings.resendDomainId
      ? { id: settings.resendDomainId, status: settings.resendDomainStatus, records: settings.resendDomainRecords, name: settings.fromEmail?.split("@")[1] }
      : null
  );
  const [domainError, setDomainError] = useState<string | null>(null);
  const [lastDomainIntent, setLastDomainIntent] = useState<string | null>(null);

  // Handle domain fetcher results
  useEffect(() => {
    if (domainFetcher.state === "idle" && domainFetcher.data !== undefined && lastDomainIntent) {
      if (domainFetcher.data?.ok) {
        if (lastDomainIntent === "domain_remove") {
          setDomainData(null);
        } else if (domainFetcher.data.domain) {
          setDomainData(domainFetcher.data.domain);
        }
        setDomainError(null);
      } else {
        setDomainError(domainFetcher.data?.error ?? "Something went wrong");
      }
      setLastDomainIntent(null);
    }
  }, [domainFetcher.state, domainFetcher.data, lastDomainIntent]);

  const handleDomainAction = useCallback((intent: string) => {
    setLastDomainIntent(intent);
    setDomainError(null);
    domainFetcher.submit(
      { intent, fromEmail },
      { method: "POST", encType: "application/json" }
    );
  }, [domainFetcher, fromEmail]);

  const domainLoading = domainFetcher.state !== "idle";

  const isSaving = fetcher.state !== "idle";
  const saved = fetcher.data?.ok && !fetcher.data?.domain && !fetcher.data?.removed && !isSaving;
  const senderUnconfigured = smtpConfigured && !envFromEmail && (!fromEmail || !fromName);

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

                  <TextField label="Email footer text" value={footerText} onChange={setFooterText} multiline={3} autoComplete="off" placeholder={"© 2024 Your Store Name. All rights reserved.\nYour Address, City, Country"} helpText="This will appear in the footer of your emails." />
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
            {domainError && (
              <Banner tone="critical" onDismiss={() => setDomainError(null)}>
                <Text as="p">{domainError}</Text>
              </Banner>
            )}

            {/* No domain registered yet */}
            {!domainData && (
              <Card>
                <BlockStack gap="400">
                  <BlockStack gap="100">
                    <Text as="h2" variant="headingSm" fontWeight="semibold">Connect your sending domain</Text>
                    <Text as="p" variant="bodySm" tone="subdued">
                      Verify your domain so emails are sent from your own address (e.g. hello@yourstore.com) instead of newsletters@attribix.email. This also improves deliverability.
                    </Text>
                  </BlockStack>
                  <Divider />
                  {!fromEmail ? (
                    <Banner tone="warning">
                      <Text as="p">Set your From email address in the Email tab first, then come back here to verify the domain.</Text>
                    </Banner>
                  ) : (
                    <BlockStack gap="300">
                      <Text as="p" variant="bodySm">
                        Domain to verify: <strong>{fromEmail.split("@")[1]}</strong> (from your From email: {fromEmail})
                      </Text>
                      <InlineStack>
                        <Button
                          variant="primary"
                          loading={domainLoading}
                          onClick={() => handleDomainAction("domain_register")}
                        >
                          Connect {fromEmail.split("@")[1]}
                        </Button>
                      </InlineStack>
                    </BlockStack>
                  )}
                </BlockStack>
              </Card>
            )}

            {/* Domain registered — show DNS records */}
            {domainData && domainData.status !== "verified" && (
              <Card>
                <BlockStack gap="400">
                  <InlineStack align="space-between" blockAlign="center">
                    <BlockStack gap="100">
                      <Text as="h2" variant="headingSm" fontWeight="semibold">Add DNS records for {domainData.name ?? fromEmail.split("@")[1]}</Text>
                      <Text as="p" variant="bodySm" tone="subdued">
                        Add these records to your domain registrar (e.g. GoDaddy, Cloudflare, Namecheap), then click "Check verification".
                      </Text>
                    </BlockStack>
                    <Badge tone="warning">Pending verification</Badge>
                  </InlineStack>
                  <Divider />

                  {/* DNS records table */}
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                      <thead>
                        <tr style={{ background: "#f9fafb", borderBottom: "1px solid #e5e7eb" }}>
                          {["Type", "Host / Name", "Value", "Status"].map(h => (
                            <th key={h} style={{ padding: "8px 12px", textAlign: "left", fontWeight: 600, color: "#374151", whiteSpace: "nowrap" }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {(domainData.records ?? []).map((rec: any, i: number) => (
                          <tr key={i} style={{ borderBottom: "1px solid #f3f4f6" }}>
                            <td style={{ padding: "8px 12px", whiteSpace: "nowrap" }}>
                              <Badge>{rec.type}</Badge>
                            </td>
                            <td style={{ padding: "8px 12px", whiteSpace: "nowrap" }}>
                              <CopyCell value={rec.name} />
                            </td>
                            <td style={{ padding: "8px 12px", maxWidth: 320 }}>
                              <CopyCell value={rec.priority != null ? `${rec.value} (priority: ${rec.priority})` : rec.value} />
                            </td>
                            <td style={{ padding: "8px 12px", whiteSpace: "nowrap" }}>
                              {rec.status === "verified"
                                ? <Badge tone="success">Verified</Badge>
                                : <Badge tone="attention">Not detected</Badge>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <InlineStack gap="300" blockAlign="center">
                    <Button
                      variant="primary"
                      loading={domainLoading}
                      onClick={() => handleDomainAction("domain_verify")}
                    >
                      Check verification
                    </Button>
                    <Button
                      tone="critical"
                      variant="plain"
                      loading={domainLoading}
                      onClick={() => handleDomainAction("domain_remove")}
                    >
                      Remove domain
                    </Button>
                  </InlineStack>
                </BlockStack>
              </Card>
            )}

            {/* Domain verified */}
            {domainData && domainData.status === "verified" && (
              <Card>
                <BlockStack gap="400">
                  <InlineStack align="space-between" blockAlign="center">
                    <BlockStack gap="100">
                      <Text as="h2" variant="headingSm" fontWeight="semibold">{domainData.name ?? fromEmail.split("@")[1]}</Text>
                      <Text as="p" variant="bodySm" tone="subdued">
                        Emails will be sent from your own domain. Replies go directly to your inbox.
                      </Text>
                    </BlockStack>
                    <Badge tone="success">Verified</Badge>
                  </InlineStack>
                  <Divider />
                  <Text as="p" variant="bodySm" tone="subdued">
                    Your campaigns will now send from <strong>{fromEmail}</strong> instead of newsletters@attribix.email.
                  </Text>
                  <InlineStack>
                    <Button
                      tone="critical"
                      variant="plain"
                      loading={domainLoading}
                      onClick={() => handleDomainAction("domain_remove")}
                    >
                      Disconnect domain
                    </Button>
                  </InlineStack>
                </BlockStack>
              </Card>
            )}
          </BlockStack>
        )}

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
