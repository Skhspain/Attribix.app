// app/routes/app._index.jsx
import { json } from "@remix-run/node";
import { useLoaderData, useNavigate } from "@remix-run/react";
import {
  Badge,
  BlockStack,
  Box,
  Button,
  Card,
  DataTable,
  Grid,
  Icon,
  InlineStack,
  Layout,
  Page,
  Text,
} from "@shopify/polaris";
import { authenticate } from "~/shopify.server";
import db from "~/db.server";

export async function loader({ request }) {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const since30 = new Date();
  since30.setDate(since30.getDate() - 30);
  since30.setHours(0, 0, 0, 0);

  const since7 = new Date();
  since7.setDate(since7.getDate() - 7);
  since7.setHours(0, 0, 0, 0);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [
    settings,
    metaConn,
    googleConn,
    revenue30,
    revenue7,
    orders30,
    orders7,
    recentPurchases,
    totalSpend,
    topSource,
  ] = await Promise.all([
    db.trackingSettings.findUnique({ where: { shop } }).catch(() => null),
    db.metaConnection.findUnique({ where: { shop } }).catch(() => null),
    db.googleConnection.findUnique({ where: { shop } }).catch(() => null),
    db.purchase.aggregate({ where: { shop, createdAt: { gte: since30 } }, _sum: { totalValue: true } }).catch(() => ({ _sum: { totalValue: 0 } })),
    db.purchase.aggregate({ where: { shop, createdAt: { gte: since7 } }, _sum: { totalValue: true } }).catch(() => ({ _sum: { totalValue: 0 } })),
    db.purchase.count({ where: { shop, createdAt: { gte: since30 } } }).catch(() => 0),
    db.purchase.count({ where: { shop, createdAt: { gte: since7 } } }).catch(() => 0),
    db.purchase.findMany({
      where: { shop },
      orderBy: { createdAt: "desc" },
      take: 6,
      select: {
        orderId: true,
        totalValue: true,
        currency: true,
        utmSource: true,
        utmCampaign: true,
        landingPage: true,
        createdAt: true,
      },
    }).catch(() => []),
    db.adSpendDaily.aggregate({ where: { shop }, _sum: { spend: true } }).catch(() => ({ _sum: { spend: 0 } })),
    db.purchase.groupBy({
      by: ["utmSource"],
      where: { shop, createdAt: { gte: since30 }, utmSource: { not: null } },
      _sum: { totalValue: true },
      _count: { orderId: true },
      orderBy: { _sum: { totalValue: "desc" } },
      take: 1,
    }).catch(() => []),
  ]);

  const rev30 = revenue30?._sum?.totalValue ?? 0;
  const rev7 = revenue7?._sum?.totalValue ?? 0;
  const spend = totalSpend?._sum?.spend ?? 0;
  const roas = spend > 0 ? rev30 / spend : null;

  // Pixel health: seen in last 24h = healthy, last 7d = warning, else = error
  const pixelLastSeen = settings?.pixelLastSeenAt ? new Date(settings.pixelLastSeenAt) : null;
  const hoursSincePixel = pixelLastSeen ? (Date.now() - pixelLastSeen.getTime()) / 3600000 : null;
  const pixelStatus = hoursSincePixel === null ? "never" : hoursSincePixel < 24 ? "healthy" : hoursSincePixel < 168 ? "warning" : "error";

  const metaConnected = !!(metaConn?.accessToken && metaConn.accessToken !== "__PENDING__" && metaConn.adAccountId);
  const googleConnected = !!(googleConn?.accessToken && googleConn.accessToken !== "__PENDING__" && googleConn.adCustomerId);

  return json({
    shop,
    rev30,
    rev7,
    orders30,
    orders7,
    roas,
    spend,
    pixelStatus,
    pixelLastSeen: pixelLastSeen?.toISOString() ?? null,
    metaConnected,
    googleConnected,
    recentPurchases,
    topSource: topSource?.[0]?.utmSource ?? null,
    attributionModel: settings?.attributionModel ?? "last_touch",
    attributionWindowDays: settings?.attributionWindowDays ?? 7,
  });
}

function formatMoney(value, currency = "USD") {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency || "USD",
      maximumFractionDigits: 0,
    }).format(value || 0);
  } catch {
    return `${Number(value || 0).toFixed(0)}`;
  }
}

function formatDate(value) {
  if (!value) return "—";
  try {
    return new Intl.DateTimeFormat("en-GB", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(value));
  } catch {
    return "—";
  }
}

function sourceColor(source) {
  const s = (source || "").toLowerCase();
  if (s.includes("meta") || s.includes("facebook")) return "#1877f2";
  if (s.includes("google")) return "#34a853";
  if (s.includes("tiktok")) return "#010101";
  if (s.includes("email")) return "#f59e0b";
  return "#6b7280";
}

function sourceBadgeTone(source) {
  const s = (source || "").toLowerCase();
  if (s.includes("meta") || s.includes("facebook")) return "info";
  if (s.includes("google")) return "success";
  if (s.includes("tiktok")) return "attention";
  return "new";
}

function KpiCard({ title, value, sub, tone }) {
  return (
    <Card>
      <BlockStack gap="100">
        <Text as="p" variant="bodySm" tone="subdued">{title}</Text>
        <Text as="p" variant="heading2xl" tone={tone}>{value}</Text>
        {sub && <Text as="p" variant="bodySm" tone="subdued">{sub}</Text>}
      </BlockStack>
    </Card>
  );
}

export default function AppIndex() {
  const data = useLoaderData();
  const navigate = useNavigate();

  const pixelBadge = {
    healthy: { tone: "success", label: "Pixel active" },
    warning:  { tone: "warning", label: "Pixel inactive >24h" },
    error:    { tone: "critical", label: "Pixel not seen" },
    never:    { tone: "critical", label: "Pixel never seen" },
  }[data.pixelStatus];

  const purchaseRows = (data.recentPurchases || []).map((p) => [
    <Text as="span" variant="bodySm">{p.orderId || "—"}</Text>,
    <Text as="span" variant="bodySm">{formatMoney(p.totalValue, p.currency)}</Text>,
    p.utmSource
      ? <Badge tone={sourceBadgeTone(p.utmSource)}>{p.utmSource}</Badge>
      : <Text as="span" variant="bodySm" tone="subdued">direct</Text>,
    <Text as="span" variant="bodySm" tone="subdued">{p.utmCampaign || "—"}</Text>,
    <Text as="span" variant="bodySm" tone="subdued">{formatDate(p.createdAt)}</Text>,
  ]);

  return (
    <Page
      title="Overview"
      subtitle={data.shop}
      primaryAction={{ content: "View attribution", onAction: () => navigate("/app/analytics") }}
    >
      <BlockStack gap="500">

        {/* KPI row */}
        <Grid>
          <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 3, xl: 3 }}>
            <KpiCard
              title="Revenue (30d)"
              value={formatMoney(data.rev30)}
              sub={`${formatMoney(data.rev7)} last 7 days`}
            />
          </Grid.Cell>
          <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 3, xl: 3 }}>
            <KpiCard
              title="Orders (30d)"
              value={String(data.orders30)}
              sub={`${data.orders7} last 7 days`}
            />
          </Grid.Cell>
          <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 3, xl: 3 }}>
            <KpiCard
              title="ROAS"
              value={data.roas !== null ? `${data.roas.toFixed(2)}x` : "—"}
              sub={data.roas !== null ? "Revenue ÷ ad spend" : "Connect an ad account"}
              tone={data.roas !== null && data.roas >= 2 ? "success" : undefined}
            />
          </Grid.Cell>
          <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 3, xl: 3 }}>
            <KpiCard
              title="Top source (30d)"
              value={data.topSource || "—"}
              sub="Highest revenue channel"
            />
          </Grid.Cell>
        </Grid>

        {/* Status cards */}
        <Grid>
          <Grid.Cell columnSpan={{ xs: 6, sm: 2, md: 2, lg: 4, xl: 4 }}>
            <Card>
              <BlockStack gap="300">
                <InlineStack align="space-between" blockAlign="center">
                  <Text as="h3" variant="headingSm">Pixel tracking</Text>
                  <Badge tone={pixelBadge.tone}>{pixelBadge.label}</Badge>
                </InlineStack>
                <Text as="p" variant="bodySm" tone="subdued">
                  {data.pixelLastSeen
                    ? `Last event: ${formatDate(data.pixelLastSeen)}`
                    : "No pixel events recorded yet"}
                </Text>
                <Button size="slim" onClick={() => navigate("/app/settings")}>
                  View settings
                </Button>
              </BlockStack>
            </Card>
          </Grid.Cell>

          <Grid.Cell columnSpan={{ xs: 6, sm: 2, md: 2, lg: 4, xl: 4 }}>
            <Card>
              <BlockStack gap="300">
                <InlineStack align="space-between" blockAlign="center">
                  <Text as="h3" variant="headingSm">Meta Ads</Text>
                  <Badge tone={data.metaConnected ? "success" : "new"}>
                    {data.metaConnected ? "Connected" : "Not connected"}
                  </Badge>
                </InlineStack>
                <Text as="p" variant="bodySm" tone="subdued">
                  {data.metaConnected
                    ? "Spend data syncing. CAPI active."
                    : "Connect Meta to sync ad spend and enable server-side CAPI."}
                </Text>
                <Button size="slim" onClick={() => navigate("/app/ads")}>
                  {data.metaConnected ? "Manage" : "Connect"}
                </Button>
              </BlockStack>
            </Card>
          </Grid.Cell>

          <Grid.Cell columnSpan={{ xs: 6, sm: 2, md: 2, lg: 4, xl: 4 }}>
            <Card>
              <BlockStack gap="300">
                <InlineStack align="space-between" blockAlign="center">
                  <Text as="h3" variant="headingSm">Google Ads</Text>
                  <Badge tone={data.googleConnected ? "success" : "new"}>
                    {data.googleConnected ? "Connected" : "Not connected"}
                  </Badge>
                </InlineStack>
                <Text as="p" variant="bodySm" tone="subdued">
                  {data.googleConnected
                    ? "Spend data syncing. Conversion upload active."
                    : "Connect Google Ads to sync spend and upload conversions."}
                </Text>
                <Button size="slim" onClick={() => navigate("/app/ads")}>
                  {data.googleConnected ? "Manage" : "Connect"}
                </Button>
              </BlockStack>
            </Card>
          </Grid.Cell>
        </Grid>

        {/* Attribution settings summary */}
        <Card>
          <InlineStack align="space-between" blockAlign="center">
            <BlockStack gap="100">
              <Text as="h3" variant="headingSm">Attribution settings</Text>
              <Text as="p" variant="bodySm" tone="subdued">
                Model: <strong>{data.attributionModel === "first_touch" ? "First touch" : "Last touch"}</strong>
                {"  ·  "}
                Window: <strong>{data.attributionWindowDays} days</strong>
              </Text>
            </BlockStack>
            <Button size="slim" onClick={() => navigate("/app/settings")}>Edit</Button>
          </InlineStack>
        </Card>

        {/* Recent purchases */}
        <Card>
          <BlockStack gap="300">
            <InlineStack align="space-between" blockAlign="center">
              <Text as="h2" variant="headingMd">Recent attributed orders</Text>
              <Button size="slim" onClick={() => navigate("/app/orders")}>View all</Button>
            </InlineStack>
            {purchaseRows.length > 0 ? (
              <DataTable
                columnContentTypes={["text", "numeric", "text", "text", "text"]}
                headings={["Order", "Value", "Source", "Campaign", "Date"]}
                rows={purchaseRows}
                increasedTableDensity
              />
            ) : (
              <Box paddingBlockStart="200">
                <Text as="p" variant="bodyMd" tone="subdued">
                  No attributed orders yet. Make sure the pixel is installed and tracking is enabled.
                </Text>
              </Box>
            )}
          </BlockStack>
        </Card>

      </BlockStack>
    </Page>
  );
}
