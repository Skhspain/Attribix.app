// app/routes/app.newsletter.tsx
// Newsletter hub — layout + nav tabs for Subscribers / Campaigns.
// NEW FILE.

import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { Outlet, useLoaderData, useLocation, NavLink } from "@remix-run/react";
import { authenticate } from "~/shopify.server";
import db from "~/db.server";
import { Page, Tabs, Card, Layout, Text, BlockStack, InlineStack, Badge } from "@shopify/polaris";

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const anyDb = db as any;

  const [subscriberCount, campaignCount, sentCount] = await Promise.all([
    db.newsletterSubscriber.count({ where: { shop, status: "subscribed" } }),
    anyDb.newsletterCampaign?.count?.({ where: { shop } }).catch(() => 0) ?? 0,
    anyDb.newsletterCampaign?.count?.({ where: { shop, status: "sent" } }).catch(() => 0) ?? 0,
  ]);

  const smtpConfigured = !!process.env.SMTP_HOST;

  return json({ shop, subscriberCount, campaignCount, sentCount, resendConfigured: smtpConfigured });
}

export default function NewsletterLayout() {
  const { subscriberCount, campaignCount, sentCount, resendConfigured } =
    useLoaderData<typeof loader>();
  const location = useLocation();

  const tabs = [
    { id: "overview", content: "Overview", url: "/app/newsletter" },
    { id: "subscribers", content: `Subscribers (${subscriberCount})`, url: "/app/newsletter/subscribers" },
    { id: "campaigns", content: "Campaigns", url: "/app/newsletter/campaigns" },
  ];

  const selected = location.pathname.includes("/subscribers")
    ? 1
    : location.pathname.includes("/campaigns")
    ? 2
    : 0;

  return (
    <Page title="Newsletter" primaryAction={{ content: "New campaign", url: "/app/newsletter/campaigns/new" }}>
      {!resendConfigured && (
        <div style={{ marginBottom: 16, padding: "12px 16px", background: "#fff3cd", borderRadius: 8, border: "1px solid #ffc107" }}>
          <Text as="p" variant="bodyMd">
            ⚠️ <strong>Email sending not configured.</strong> Add <code>SMTP_HOST</code> and <code>SMTP_USER</code> to your Fly.io secrets to enable sending.
          </Text>
        </div>
      )}

      <div style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", gap: 12, borderBottom: "1px solid #e1e3e5", paddingBottom: 0 }}>
          {tabs.map((tab, i) => (
            <NavLink
              key={tab.id}
              to={tab.url}
              end={i === 0}
              style={({ isActive }) => ({
                padding: "12px 16px",
                textDecoration: "none",
                fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
                fontSize: 14,
                fontWeight: isActive ? 600 : 400,
                color: isActive ? "#008060" : "#6d7175",
                borderBottom: isActive ? "2px solid #008060" : "2px solid transparent",
                marginBottom: -1,
              })}
            >
              {tab.content}
            </NavLink>
          ))}
        </div>
      </div>

      <Outlet />
    </Page>
  );
}
