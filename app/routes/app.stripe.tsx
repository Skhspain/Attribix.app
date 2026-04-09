// app/routes/app.stripe.tsx
// Stripe revenue dashboard — merchants connect their Stripe restricted API key
// and see revenue, MRR, subscriptions, and attribution overlay.

import { json, type LoaderFunctionArgs, type ActionFunctionArgs } from "@remix-run/node";
import { useLoaderData, useFetcher } from "@remix-run/react";
import { authenticate } from "~/shopify.server";
import db from "~/db.server";
import {
  Page, Card, BlockStack, InlineStack, Text, TextField, Button,
  Banner, Badge, DataTable, Divider, Grid, Box,
} from "@shopify/polaris";
import { useState } from "react";

// ─── Loader ──────────────────────────────────────────────────────────────────

export async function loader({ request }: LoaderFunctionArgs) {
  const { session, admin } = await authenticate.admin(request);
  const shop = session.shop;
  const anyDb = db as any;

  const conn = await anyDb.stripeConnection?.findUnique?.({ where: { shop } }).catch(() => null);
  if (!conn) return json({ connected: false, shop });

  const { getShopPlan, getHistoryCutoff } = await import("~/services/plan.server");
  const plan = await getShopPlan(shop, admin);
  const historyCutoff = getHistoryCutoff(plan);

  try {
    const { fetchStripeSummary } = await import("~/services/stripe.server");
    const summary = await fetchStripeSummary(conn.apiKey, historyCutoff);

    // Attribution overlay — match Stripe customer emails to purchases via customerEmail or orderId
    // We store email on TrackedEvent if available; fall back to best-effort matching
    const emails = [
      ...summary.recentCharges.map((c: any) => c.customerEmail),
      ...summary.subscriptions.map((s: any) => s.customerEmail),
    ].filter(Boolean) as string[];

    // Look up attribution from TrackedEvent by email stored in event metadata
    const anyDb2 = db as any;
    const events = emails.length > 0
      ? await anyDb2.trackedEvent?.findMany?.({
          where: { shop, email: { in: emails } },
          select: { email: true, utmSource: true, utmMedium: true, utmCampaign: true, fbclid: true, gclid: true },
        }).catch(() => []) ?? []
      : [];

    const attrByEmail: Record<string, { source: string; medium: string; campaign: string }> = {};
    for (const e of events) {
      if (!e.email) continue;
      attrByEmail[e.email] = {
        source: e.utmSource ?? (e.fbclid ? "meta" : e.gclid ? "google" : "direct"),
        medium: e.utmMedium ?? (e.fbclid ? "paid_social" : e.gclid ? "cpc" : ""),
        campaign: e.utmCampaign ?? "",
      };
    }

    return json({
      connected: true,
      shop,
      accountName: conn.accountName,
      summary,
      attrByEmail,
      historyDays: plan === "starter" ? 30 : plan === "growth" ? 90 : 365,
    });
  } catch (e: any) {
    return json({ connected: true, shop, accountName: conn.accountName, error: e.message });
  }
}

// ─── Action ──────────────────────────────────────────────────────────────────

export async function action({ request }: ActionFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const anyDb = db as any;
  const body = await request.json().catch(() => ({}));
  const intent = body?.intent as string;

  if (intent === "connect") {
    const apiKey = String(body.apiKey ?? "").trim();
    if (!apiKey.startsWith("sk_")) {
      return json({ ok: false, error: "Invalid API key — must start with sk_live_ or sk_test_" }, { status: 400 });
    }

    const { verifyStripeKey } = await import("~/services/stripe.server");
    const result = await verifyStripeKey(apiKey);
    if (!result.valid) {
      return json({ ok: false, error: result.error ?? "Could not verify API key" }, { status: 400 });
    }

    await anyDb.stripeConnection?.upsert?.({
      where: { shop },
      create: { shop, apiKey, accountName: result.name ?? null, currency: result.currency ?? null },
      update: { apiKey, accountName: result.name ?? null, currency: result.currency ?? null, lastSyncedAt: new Date() },
    });

    return json({ ok: true, accountName: result.name });
  }

  if (intent === "disconnect") {
    await anyDb.stripeConnection?.delete?.({ where: { shop } }).catch(() => null);
    return json({ ok: true });
  }

  return json({ ok: false, error: "Unknown intent" }, { status: 400 });
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt(amount: number, currency: string) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: currency || "USD", maximumFractionDigits: 0 })
    .format(amount / 100);
}

function fmtDate(unix: number) {
  return new Date(unix * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function StripePage() {
  const data = useLoaderData<typeof loader>() as any;
  const fetcher = useFetcher<any>();
  const [apiKey, setApiKey] = useState("");

  const busy = fetcher.state !== "idle";

  function connect() {
    fetcher.submit({ intent: "connect", apiKey }, { method: "post", encType: "application/json" });
  }
  function disconnect() {
    fetcher.submit({ intent: "disconnect" }, { method: "post", encType: "application/json" });
  }

  // ── Not connected ─────────────────────────────────────────────────────────
  if (!data.connected || fetcher.data?.ok === true && fetcher.formData?.get?.("intent") === "disconnect") {
    return (
      <Page title="Stripe" subtitle="Connect your Stripe account to see revenue alongside your attribution data.">
        <BlockStack gap="500">
          {fetcher.data?.error && (
            <Banner tone="critical"><Text as="p">{fetcher.data.error}</Text></Banner>
          )}
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">Connect Stripe</Text>
              <Text as="p" variant="bodySm" tone="subdued">
                Create a <strong>Restricted API key</strong> in your Stripe Dashboard with read access to:
                Charges, Customers, and Subscriptions. Never use your secret key.
              </Text>
              <BlockStack gap="300">
                <TextField
                  label="Stripe Restricted API Key"
                  value={apiKey}
                  onChange={setApiKey}
                  placeholder="sk_live_..."
                  autoComplete="off"
                  type="password"
                />
                <Button variant="primary" onClick={connect} loading={busy} disabled={!apiKey || busy}>
                  Connect Stripe
                </Button>
              </BlockStack>
              <Divider />
              <Text as="p" variant="bodySm" tone="subdued">
                How to create a restricted key: Stripe Dashboard → Developers → API keys → + Create restricted key → enable Read on Charges, Customers, Subscriptions.
              </Text>
            </BlockStack>
          </Card>
        </BlockStack>
      </Page>
    );
  }

  const { summary, attrByEmail, accountName, error, historyDays } = data;

  // ── Error state ───────────────────────────────────────────────────────────
  if (error) {
    return (
      <Page title="Stripe">
        <BlockStack gap="400">
          <Banner tone="critical" title="Stripe error">
            <Text as="p">{error}</Text>
          </Banner>
          <Button onClick={disconnect} tone="critical" variant="plain">Disconnect Stripe</Button>
        </BlockStack>
      </Page>
    );
  }

  const currency = summary.currency ?? "USD";

  // Charge rows
  const chargeRows = (summary.recentCharges ?? []).map((c: any) => {
    const attr = attrByEmail?.[c.customerEmail] ?? null;
    return [
      fmtDate(c.createdAt),
      c.customerName ?? c.customerEmail ?? "—",
      c.customerEmail ?? "—",
      fmt(c.amount, currency),
      attr ? (
        <Badge tone="success">{attr.source}</Badge>
      ) : (
        <Badge tone="subdued">Unknown</Badge>
      ),
      attr?.campaign || "—",
    ];
  });

  // Subscription rows
  const subRows = (summary.subscriptions ?? []).map((s: any) => {
    const attr = attrByEmail?.[s.customerEmail] ?? null;
    return [
      s.customerEmail ?? "—",
      s.planName ?? "—",
      `${fmt(s.amount, currency)}/${s.interval}`,
      <Badge tone={s.status === "active" ? "success" : "warning"}>{s.status}</Badge>,
      fmtDate(s.currentPeriodEnd),
      attr ? <Badge tone="success">{attr.source}</Badge> : <Badge tone="subdued">Unknown</Badge>,
    ];
  });

  return (
    <Page
      title="Stripe"
      subtitle={`Connected to ${accountName ?? "Stripe"} · Last ${historyDays} days`}
      secondaryActions={[{ content: "Disconnect", destructive: true, onAction: disconnect }]}
    >
      <BlockStack gap="500">

        {/* KPI cards */}
        <Grid>
          {[
            { label: "Total Revenue", value: fmt(summary.totalRevenue, currency), sub: `${summary.chargesCount} charges` },
            { label: "MRR", value: fmt(summary.mrr, currency), sub: "Monthly recurring" },
            { label: "Active Subscriptions", value: summary.activeSubscriptions.toLocaleString(), sub: "Currently active" },
          ].map(({ label, value, sub }) => (
            <Grid.Cell key={label} columnSpan={{ xs: 6, sm: 4, md: 4, lg: 4, xl: 4 }}>
              <Card>
                <BlockStack gap="100">
                  <Text as="p" variant="bodySm" tone="subdued">{label}</Text>
                  <Text as="p" variant="heading2xl" fontWeight="bold">{value}</Text>
                  <Text as="p" variant="bodySm" tone="subdued">{sub}</Text>
                </BlockStack>
              </Card>
            </Grid.Cell>
          ))}
        </Grid>

        {/* Recent charges + attribution */}
        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingMd">Recent Charges</Text>
            <Text as="p" variant="bodySm" tone="subdued">
              Attribution matched by customer email against Attribix tracked purchases.
            </Text>
            {chargeRows.length > 0 ? (
              <DataTable
                columnContentTypes={["text", "text", "text", "numeric", "text", "text"]}
                headings={["Date", "Customer", "Email", "Amount", "Source", "Campaign"]}
                rows={chargeRows}
              />
            ) : (
              <Text as="p" tone="subdued">No charges found in this period.</Text>
            )}
          </BlockStack>
        </Card>

        {/* Subscriptions */}
        {subRows.length > 0 && (
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">Active Subscriptions</Text>
              <DataTable
                columnContentTypes={["text", "text", "numeric", "text", "text", "text"]}
                headings={["Customer", "Plan", "Amount", "Status", "Renews", "Source"]}
                rows={subRows}
              />
            </BlockStack>
          </Card>
        )}

      </BlockStack>
    </Page>
  );
}
