// app/routes/app.newsletter.tsx
// Newsletter section layout: section tabs above the list pages. Editor pages
// (a newsletter, a template picker, a flow email) get the whole screen.

import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { Outlet, useLoaderData, useLocation, useNavigate } from "@remix-run/react";
import { Banner, BlockStack, Box, Page, Tabs, Text } from "@shopify/polaris";
import { authenticate } from "~/shopify.server";
import db from "~/db.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  // Mark newsletter as seen so the dashboard notification badge clears
  (db as any).trackingSettings?.upsert?.({
    where: { shop },
    create: { shop, newsletterSeenAt: new Date() },
    update: { newsletterSeenAt: new Date() },
  }).catch(() => null);

  const subscriberCount = await db.newsletterSubscriber.count({ where: { shop, status: "subscribed" } });
  return json({ subscriberCount, sendingAvailable: !!process.env.SMTP_HOST });
}

const SECTIONS = [
  { id: "overview", label: "Overview", url: "/app/newsletter" },
  { id: "campaigns", label: "Newsletters", url: "/app/newsletter/campaigns" },
  { id: "flows", label: "Flows", url: "/app/newsletter/flows" },
  { id: "subscribers", label: "Subscribers", url: "/app/newsletter/subscribers" },
  { id: "widget", label: "Signup form", url: "/app/newsletter/widget" },
  { id: "settings", label: "Settings", url: "/app/newsletter/settings" },
];

// Full-screen editors: no section tabs above them.
const EDITOR_PATHS = [/^\/app\/newsletter\/campaigns\/(?!$)[^/]+$/, /^\/app\/newsletter\/flows\/[^/]+\/steps\//];

export default function NewsletterLayout() {
  const { subscriberCount, sendingAvailable } = useLoaderData<typeof loader>();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const path = pathname.replace(/\/$/, "");

  if (EDITOR_PATHS.some((re) => re.test(path))) return <Outlet />;

  // Sub-pages (e.g. /analytics, /review-requests) fall back to Overview.
  const selected = Math.max(
    0,
    SECTIONS.findIndex((s, i) => i > 0 && (path === s.url || path.startsWith(`${s.url}/`))),
  );
  const tabs = SECTIONS.map((s) => ({
    id: s.id,
    content: s.id === "subscribers" ? `Subscribers (${subscriberCount.toLocaleString()})` : s.label,
    panelID: `${s.id}-panel`,
  }));

  return (
    <Page title="Newsletter" primaryAction={{ content: "New newsletter", url: "/app/newsletter/campaigns/new" }}>
      <BlockStack gap="400">
        {!sendingAvailable && (
          <Banner tone="warning" title="Sending isn't available yet">
            <Text as="p">Email sending hasn't been switched on for your store yet. Contact Attribix support.</Text>
          </Banner>
        )}
        <Tabs tabs={tabs} selected={selected} onSelect={(i) => navigate(SECTIONS[i].url)} />
        <Box>
          <Outlet />
        </Box>
      </BlockStack>
    </Page>
  );
}
