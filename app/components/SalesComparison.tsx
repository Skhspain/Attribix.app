// Attribix-tracked orders from one ad platform vs what that platform reports.
// shopifyRevenue/shopifyOrders are only the orders Attribix attributed to that
// platform, not all Shopify sales.
import { Card, BlockStack, Text } from "@shopify/polaris";

function fmt(value: number, currency = "NOK") {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(value || 0);
  } catch {
    return `${Number(value || 0).toFixed(0)}`;
  }
}

type Props = {
  shopifyRevenue: number;
  shopifyOrders: number;
  platformName: string; // "Meta" | "Google" | "Meta + Google"
  platformRevenue: number;
  currency?: string;
  period?: string;
};

export function SalesComparison({ shopifyRevenue, shopifyOrders, platformName, platformRevenue, currency = "NOK", period = "7d" }: Props) {
  if (platformRevenue <= 0) return null;

  const diff = platformRevenue - shopifyRevenue;
  const pct = shopifyRevenue > 0 ? Math.round((diff / shopifyRevenue) * 100) : 0;

  // Only show when platform reports 20%+ more than Shopify
  if (pct < 20) return null;
  const sign = diff >= 0 ? "+" : "";
  const bigGap = Math.abs(pct) > 20;

  // We don't measure why the two differ, so offer possible reasons, not a cause.
  const explanation = `Possible reasons: ${platformName}'s longer attribution window, view-through conversions, orders Attribix couldn't track, or conversions ${platformName} counts differently. Compare attribution windows and conversion definitions before relying on either.`;

  return (
    <Card>
      <BlockStack gap="300">
        <Text as="h2" variant="headingSm">Attribix-attributed vs {platformName}-reported ({period})</Text>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
          <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 8, padding: "14px 16px" }}>
            <Text as="p" variant="bodySm" tone="subdued">{platformName}-attributed Shopify revenue</Text>
            <Text as="p" variant="headingLg">{fmt(shopifyRevenue, currency)}</Text>
            <Text as="p" variant="bodySm" tone="subdued">{shopifyOrders} orders Attribix attributed to {platformName}</Text>
          </div>
          <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 8, padding: "14px 16px" }}>
            <Text as="p" variant="bodySm" tone="subdued">{platformName}-reported conversion value</Text>
            <Text as="p" variant="headingLg">{fmt(platformRevenue, currency)}</Text>
          </div>
          <div style={{
            background: bigGap ? "#fffbeb" : "#f0fdf4",
            border: `1px solid ${bigGap ? "#fde68a" : "#bbf7d0"}`,
            borderRadius: 8,
            padding: "14px 16px",
          }}>
            <Text as="p" variant="bodySm" tone="subdued">Difference</Text>
            <Text as="p" variant="headingLg">{sign}{pct}%</Text>
            <Text as="p" variant="bodySm" tone="subdued">{explanation}</Text>
          </div>
        </div>
      </BlockStack>
    </Card>
  );
}
