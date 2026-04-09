// app/routes/app.tiktok-ads.tsx
// TikTok Ads dashboard — campaign + ad performance
import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, useNavigate } from "@remix-run/react";
import { authenticate } from "~/shopify.server";
import db from "~/db.server";
import {
  Page, Card, Text, BlockStack, InlineStack, Badge, Banner, Select, Button,
} from "@shopify/polaris";
import { useState, useCallback, useEffect } from "react";

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const anyDb = db as any;

  const url = new URL(request.url);
  const days = parseInt(url.searchParams.get("days") || "30");

  const conn = await anyDb.tikTokConnection?.findUnique?.({ where: { shop } });
  const connected = !!conn && conn.accessToken !== "__PENDING__" && !!conn.advertiserId;

  if (!connected) {
    return json({ connected: false, campaigns: [], ads: [], totals: { spend: 0, impressions: 0, clicks: 0, conversions: 0, conversionValue: 0 }, days });
  }

  const since = new Date();
  since.setDate(since.getDate() - days);

  const campaigns = await anyDb.tikTokCampaignDailyInsight?.findMany?.({
    where: { shop, date: { gte: since } },
    orderBy: { date: "desc" },
  }).catch(() => []) ?? [];

  const ads = await anyDb.tikTokAdDailyInsight?.findMany?.({
    where: { shop, date: { gte: since } },
    orderBy: { date: "desc" },
  }).catch(() => []) ?? [];

  // Aggregate by campaign
  const campaignMap = new Map<string, { name: string; spend: number; impressions: number; clicks: number; conversions: number; conversionValue: number }>();
  for (const c of campaigns) {
    const existing = campaignMap.get(c.campaignId) || { name: c.campaignName || c.campaignId, spend: 0, impressions: 0, clicks: 0, conversions: 0, conversionValue: 0 };
    existing.spend += c.spend;
    existing.impressions += c.impressions;
    existing.clicks += c.clicks;
    existing.conversions += c.conversions;
    existing.conversionValue += c.conversionValue;
    if (c.campaignName) existing.name = c.campaignName;
    campaignMap.set(c.campaignId, existing);
  }

  const campaignList = Array.from(campaignMap.entries()).map(([id, data]) => ({
    id,
    ...data,
    ctr: data.impressions > 0 ? ((data.clicks / data.impressions) * 100).toFixed(2) : "0.00",
    roas: data.spend > 0 ? (data.conversionValue / data.spend).toFixed(2) : "0.00",
  })).sort((a, b) => b.spend - a.spend);

  // Aggregate by ad
  const adMap = new Map<string, { name: string; campaignName: string; adGroupName: string; spend: number; impressions: number; clicks: number; conversions: number; conversionValue: number }>();
  for (const a of ads) {
    const existing = adMap.get(a.adId) || { name: a.adName || a.adId, campaignName: a.campaignName || "", adGroupName: a.adGroupName || "", spend: 0, impressions: 0, clicks: 0, conversions: 0, conversionValue: 0 };
    existing.spend += a.spend;
    existing.impressions += a.impressions;
    existing.clicks += a.clicks;
    existing.conversions += a.conversions;
    existing.conversionValue += a.conversionValue;
    if (a.adName) existing.name = a.adName;
    if (a.campaignName) existing.campaignName = a.campaignName;
    if (a.adGroupName) existing.adGroupName = a.adGroupName;
    adMap.set(a.adId, existing);
  }

  const adList = Array.from(adMap.entries()).map(([id, data]) => ({
    id,
    ...data,
    ctr: data.impressions > 0 ? ((data.clicks / data.impressions) * 100).toFixed(2) : "0.00",
    roas: data.spend > 0 ? (data.conversionValue / data.spend).toFixed(2) : "0.00",
  })).sort((a, b) => b.spend - a.spend);

  const totals = {
    spend: campaignList.reduce((s, c) => s + c.spend, 0),
    impressions: campaignList.reduce((s, c) => s + c.impressions, 0),
    clicks: campaignList.reduce((s, c) => s + c.clicks, 0),
    conversions: campaignList.reduce((s, c) => s + c.conversions, 0),
    conversionValue: campaignList.reduce((s, c) => s + c.conversionValue, 0),
  };

  return json({ connected: true, campaigns: campaignList, ads: adList, totals, days });
}

function KpiCard({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ flex: 1, minWidth: 120, padding: "14px 18px", background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8 }}>
      <Text as="p" variant="bodySm" tone="subdued">{label}</Text>
      <Text as="p" variant="headingLg">{value}</Text>
    </div>
  );
}

export default function TikTokAdsPage() {
  const { connected, campaigns, ads, totals, days } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const [view, setView] = useState<"campaigns" | "ads">("campaigns");

  if (!connected) {
    return (
      <Page title="TikTok Ads">
        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingMd">TikTok Ads not connected</Text>
            <Text as="p" variant="bodyMd" tone="subdued">
              Connect your TikTok Ads Manager and select an advertiser account to see your ad performance here.
            </Text>
            <Button variant="primary" onClick={() => navigate("/app/integrations/tiktok")}>
              Go to TikTok Integration
            </Button>
          </BlockStack>
        </Card>
      </Page>
    );
  }

  const roas = totals.spend > 0 ? (totals.conversionValue / totals.spend).toFixed(2) : "0.00";
  const ctr = totals.impressions > 0 ? ((totals.clicks / totals.impressions) * 100).toFixed(2) : "0.00";

  return (
    <Page
      title="TikTok Ads"
      secondaryActions={[
        { content: "Settings", onAction: () => navigate("/app/integrations/tiktok") },
      ]}
    >
      <BlockStack gap="500">
        {/* Date range selector */}
        <InlineStack gap="300" blockAlign="center">
          {[7, 14, 30, 90].map((d) => (
            <Button
              key={d}
              variant={days === d ? "primary" : "secondary"}
              size="slim"
              onClick={() => navigate(`/app/tiktok-ads?days=${d}`)}
            >
              {d}d
            </Button>
          ))}
        </InlineStack>

        {/* KPIs */}
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <KpiCard label="Total Spend" value={`$${totals.spend.toFixed(2)}`} />
          <KpiCard label="Impressions" value={totals.impressions.toLocaleString()} />
          <KpiCard label="Clicks" value={totals.clicks.toLocaleString()} />
          <KpiCard label="CTR" value={`${ctr}%`} />
          <KpiCard label="Conversions" value={totals.conversions.toLocaleString()} />
          <KpiCard label="Revenue" value={`$${totals.conversionValue.toFixed(2)}`} />
          <KpiCard label="ROAS" value={`${roas}x`} />
        </div>

        {/* View toggle */}
        <InlineStack gap="200">
          <Button variant={view === "campaigns" ? "primary" : "secondary"} size="slim" onClick={() => setView("campaigns")}>
            Campaigns ({campaigns.length})
          </Button>
          <Button variant={view === "ads" ? "primary" : "secondary"} size="slim" onClick={() => setView("ads")}>
            Ads ({ads.length})
          </Button>
        </InlineStack>

        {/* Table */}
        <Card padding="0">
          <div style={{ overflowX: "auto" }}>
            {view === "campaigns" ? (
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: "2px solid #e5e7eb", background: "#f9fafb" }}>
                    {["Campaign", "Spend", "Impressions", "Clicks", "CTR", "Conversions", "Revenue", "ROAS"].map((h) => (
                      <th key={h} style={{ textAlign: "left", padding: "10px 14px", color: "#6b7280", fontWeight: 600, whiteSpace: "nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {campaigns.length === 0 && (
                    <tr><td colSpan={8} style={{ padding: "24px 14px", textAlign: "center", color: "#9ca3af" }}>No campaign data yet. Sync from TikTok Integration settings.</td></tr>
                  )}
                  {campaigns.map((c: any) => (
                    <tr key={c.id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                      <td style={{ padding: "10px 14px", fontWeight: 500, maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis" }}>{c.name}</td>
                      <td style={{ padding: "10px 14px" }}>${c.spend.toFixed(2)}</td>
                      <td style={{ padding: "10px 14px" }}>{c.impressions.toLocaleString()}</td>
                      <td style={{ padding: "10px 14px" }}>{c.clicks.toLocaleString()}</td>
                      <td style={{ padding: "10px 14px" }}>{c.ctr}%</td>
                      <td style={{ padding: "10px 14px" }}>{c.conversions}</td>
                      <td style={{ padding: "10px 14px" }}>${c.conversionValue.toFixed(2)}</td>
                      <td style={{ padding: "10px 14px", fontWeight: 600, color: parseFloat(c.roas) >= 1 ? "#16a34a" : "#dc2626" }}>{c.roas}x</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: "2px solid #e5e7eb", background: "#f9fafb" }}>
                    {["Ad", "Campaign", "Ad Group", "Spend", "Clicks", "CTR", "Conv.", "Revenue", "ROAS"].map((h) => (
                      <th key={h} style={{ textAlign: "left", padding: "10px 14px", color: "#6b7280", fontWeight: 600, whiteSpace: "nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ads.length === 0 && (
                    <tr><td colSpan={9} style={{ padding: "24px 14px", textAlign: "center", color: "#9ca3af" }}>No ad data yet.</td></tr>
                  )}
                  {ads.map((a: any) => (
                    <tr key={a.id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                      <td style={{ padding: "10px 14px", fontWeight: 500, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis" }}>{a.name}</td>
                      <td style={{ padding: "10px 14px", color: "#6b7280", fontSize: 12 }}>{a.campaignName}</td>
                      <td style={{ padding: "10px 14px", color: "#6b7280", fontSize: 12 }}>{a.adGroupName}</td>
                      <td style={{ padding: "10px 14px" }}>${a.spend.toFixed(2)}</td>
                      <td style={{ padding: "10px 14px" }}>{a.clicks.toLocaleString()}</td>
                      <td style={{ padding: "10px 14px" }}>{a.ctr}%</td>
                      <td style={{ padding: "10px 14px" }}>{a.conversions}</td>
                      <td style={{ padding: "10px 14px" }}>${a.conversionValue.toFixed(2)}</td>
                      <td style={{ padding: "10px 14px", fontWeight: 600, color: parseFloat(a.roas) >= 1 ? "#16a34a" : "#dc2626" }}>{a.roas}x</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </Card>
      </BlockStack>
    </Page>
  );
}
