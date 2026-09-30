// app/routes/app.newsletter.settings.tsx
// Newsletter settings: sender identity, sending domain verification, monthly usage.

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
  Banner, Badge, BlockStack, Button, Card, Checkbox, Divider, FormLayout,
  InlineStack, Page, ProgressBar, Tabs, Text, TextField,
} from "@shopify/polaris";
import { useState, useCallback, useEffect } from "react";

// ─── Loader ──────────────────────────────────────────────────────────────────

export async function loader({ request }: LoaderFunctionArgs) {
  const { session, admin } = await authenticate.admin(request);
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

  // Same quota the send button enforces.
  const { getShopPlan, checkNewsletterSendsQuota } = await import("~/services/plan.server");
  const quota = await checkNewsletterSendsQuota(shop, await getShopPlan(shop, admin), 0);
  const emailsSentThisMonth = quota.used;
  const monthlyEmailLimit = quota.limit;

  return json({
    settings: settings ?? { fromName: "", fromEmail: "", replyTo: "", footerText: "", doubleOptIn: false, monthlyEmailLimit: 2500, resendDomainId: null, resendDomainStatus: null, resendDomainRecords: null },
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
        resendDomainName: result.domain.name?.toLowerCase() ?? null,
        resendDomainRecords: result.domain.records,
      },
      update: {
        resendDomainId: result.domain.id,
        resendDomainStatus: result.domain.status,
        resendDomainName: result.domain.name?.toLowerCase() ?? null,
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
        resendDomainName: result.domain.name?.toLowerCase() ?? null,
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
      data: { resendDomainId: null, resendDomainStatus: null, resendDomainName: null, resendDomainRecords: null },
    }).catch(() => null);

    return json({ ok: true, removed: true });
  }

  // ── Default: save settings ──────────────────────────────────────────────
  await anyDb.newsletterSettings?.upsert?.({
    where: { shop },
    create: { shop, fromName: body.fromName ?? "", fromEmail: body.fromEmail ?? "", replyTo: body.replyTo ?? "", footerText: body.footerText ?? "", doubleOptIn: !!body.doubleOptIn },
    update: { fromName: body.fromName ?? "", fromEmail: body.fromEmail ?? "", replyTo: body.replyTo ?? "", footerText: body.footerText ?? "", doubleOptIn: !!body.doubleOptIn },
  }).catch(() => null);

  return json({ ok: true });
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

const TABS = [
  { id: "sender", content: "Sender" },
  { id: "domain", content: "Sending domain" },
  { id: "usage", content: "Usage" },
];

export default function NewsletterSettingsPage() {
  const { settings, smtpConfigured, emailsSentThisMonth, monthlyEmailLimit } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<any>();
  const domainFetcher = useFetcher<any>();

  const [tab, setTab] = useState(0);
  const [fromName, setFromName] = useState(settings.fromName ?? "");
  const [fromEmail, setFromEmail] = useState(settings.fromEmail ?? "");
  const [replyTo, setReplyTo] = useState(settings.replyTo ?? "");
  const [footerText, setFooterText] = useState(settings.footerText ?? "");
  const [doubleOptIn, setDoubleOptIn] = useState<boolean>(!!(settings as any).doubleOptIn);

  // Domain verification state
  const [domainData, setDomainData] = useState<any>(
    settings.resendDomainId
      ? { id: settings.resendDomainId, status: settings.resendDomainStatus, records: settings.resendDomainRecords, name: settings.fromEmail?.split("@")[1] }
      : null
  );
  const [domainError, setDomainError] = useState<string | null>(null);
  const [lastDomainIntent, setLastDomainIntent] = useState<string | null>(null);

  useEffect(() => {
    if (domainFetcher.state === "idle" && domainFetcher.data !== undefined && lastDomainIntent) {
      if (domainFetcher.data?.ok) {
        if (lastDomainIntent === "domain_remove") setDomainData(null);
        else if (domainFetcher.data.domain) setDomainData(domainFetcher.data.domain);
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
    domainFetcher.submit({ intent, fromEmail }, { method: "POST", encType: "application/json" });
  }, [domainFetcher, fromEmail]);

  const domainLoading = domainFetcher.state !== "idle";
  const isSaving = fetcher.state !== "idle";
  const saved = fetcher.data?.ok && !fetcher.data?.domain && !fetcher.data?.removed && !isSaving;
  const unlimited = monthlyEmailLimit === -1;
  const usedPct = unlimited ? 0 : Math.min(100, Math.round((emailsSentThisMonth / Math.max(1, monthlyEmailLimit)) * 100));

  function handleSave() {
    fetcher.submit({ fromName, fromEmail, replyTo, footerText, doubleOptIn }, { method: "post", encType: "application/json" });
  }

  return (
    <Page
      title="Newsletter settings"
      primaryAction={tab === 0 ? { content: saved ? "Saved" : "Save", onAction: handleSave, loading: isSaving } : undefined}
    >
      <BlockStack gap="400">
        {!smtpConfigured && (
          <Banner tone="warning" title="Sending isn't available yet">
            <Text as="p">Email sending hasn't been switched on for your store. Contact Attribix support.</Text>
          </Banner>
        )}
        <Tabs tabs={TABS} selected={tab} onSelect={setTab} />

        {tab === 0 && (
          <BlockStack gap="400">
            <Card>
              <BlockStack gap="400">
                <BlockStack gap="100">
                  <Text as="h2" variant="headingSm">Sender</Text>
                  <Text as="p" tone="subdued">Pre-filled on every new newsletter and used for flow emails.</Text>
                </BlockStack>
                <FormLayout>
                  <TextField label="Sender name" value={fromName} onChange={setFromName} autoComplete="organization" placeholder="Your store" helpText="The name subscribers see in their inbox." />
                  <FormLayout.Group>
                    <TextField
                      label="Sender email"
                      value={fromEmail}
                      onChange={setFromEmail}
                      autoComplete="email"
                      type="email"
                      placeholder="hello@yourstore.com"
                      helpText="Emails come from this address once its domain is verified (Sending domain tab). Until then they're sent from Attribix's address and replies come here."
                    />
                    <TextField label="Reply-to email (optional)" value={replyTo} onChange={setReplyTo} autoComplete="email" type="email" placeholder="support@yourstore.com" helpText="Only if replies should go somewhere else." />
                  </FormLayout.Group>
                </FormLayout>
              </BlockStack>
            </Card>
            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingSm">Signups</Text>
                <Checkbox
                  label="Ask new subscribers to confirm their email (double opt-in)"
                  checked={doubleOptIn}
                  onChange={setDoubleOptIn}
                  helpText="Recommended, especially for customers in the UK and EU. New signups get a confirmation email and only receive newsletters after clicking it. This keeps fake and mistyped addresses off your list and gives you proof of consent."
                />
              </BlockStack>
            </Card>
            <Card>
              <BlockStack gap="300">
                <BlockStack gap="100">
                  <Text as="h2" variant="headingSm">Footer for older emails</Text>
                  <Text as="p" tone="subdued">
                    Emails made with the new editor have their own footer block with your address. This text is only added to emails made with the old editor.
                  </Text>
                </BlockStack>
                <TextField label="Footer text" labelHidden value={footerText} onChange={setFooterText} multiline={3} autoComplete="off" placeholder="Your store · Street 1, City, Country" />
              </BlockStack>
            </Card>
          </BlockStack>
        )}

        {tab === 1 && (
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
                      <Text as="p">Set your sender email on the Sender tab first, then come back here to verify its domain.</Text>
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

        {tab === 2 && (
          <Card>
            <BlockStack gap="300">
              <InlineStack align="space-between" blockAlign="center">
                <Text as="h2" variant="headingSm">Emails sent this month</Text>
                <Text as="p" fontWeight="semibold">
                  {unlimited ? emailsSentThisMonth.toLocaleString() : `${emailsSentThisMonth.toLocaleString()} of ${monthlyEmailLimit.toLocaleString()}`}
                </Text>
              </InlineStack>
              {!unlimited && <ProgressBar progress={usedPct} tone={usedPct >= 100 ? "critical" : "primary"} size="small" />}
              <Text as="p" tone="subdued">
                {unlimited ? "Your plan has no monthly limit." : `${Math.max(0, monthlyEmailLimit - emailsSentThisMonth).toLocaleString()} emails left this month. A newsletter counts one email per recipient.`}
              </Text>
              <InlineStack>
                <Button url="/app/billing">Change plan</Button>
              </InlineStack>
            </BlockStack>
          </Card>
        )}
      </BlockStack>
    </Page>
  );
}
