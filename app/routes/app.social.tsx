// app/routes/app.social.tsx
// Social Media hub — layout with tabs for Compose / Calendar / Analytics / Accounts.

import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { Outlet, useLoaderData, useLocation, NavLink } from "@remix-run/react";
import { authenticate } from "~/shopify.server";
import db from "~/db.server";
import { Page, Text, Badge, InlineStack } from "@shopify/polaris";
import { publishDuePosts } from "~/services/social.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const anyDb = db as any;

  // Opportunistically publish any due scheduled posts
  publishDuePosts().catch(() => {});

  const [totalPosts, scheduledCount, accounts] = await Promise.all([
    anyDb.socialPost?.count?.({ where: { shop, status: "published" } }).catch(() => 0) ?? 0,
    anyDb.socialPost?.count?.({ where: { shop, status: "scheduled" } }).catch(() => 0) ?? 0,
    anyDb.socialAccount?.findMany?.({ where: { shop, connected: true } }).catch(() => []) ?? [],
  ]);

  const connectedPlatforms = (accounts as any[]).map((a: any) => a.platform);
  const metaConnected = !!(await anyDb.metaConnection?.findUnique?.({ where: { shop } }).catch(() => null));

  return json({ totalPosts, scheduledCount, connectedPlatforms, metaConnected });
}

const TABS = [
  { id: "compose",   label: "Compose",   url: "/app/social",            end: true },
  { id: "calendar",  label: "Calendar",  url: "/app/social/calendar",   end: false },
  { id: "analytics", label: "Analytics", url: "/app/social/analytics",  end: false },
  { id: "accounts",  label: "Accounts",  url: "/app/social/accounts",   end: false },
];

export default function SocialLayout() {
  const { scheduledCount, connectedPlatforms, metaConnected } = useLoaderData<typeof loader>();
  const location = useLocation();

  return (
    <Page
      title="Social Media"
      primaryAction={{ content: "New post", url: "/app/social" }}
    >
      {/* Tab nav */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", gap: 4, borderBottom: "1px solid #e1e3e5", paddingBottom: 0 }}>
          {TABS.map((tab) => (
            <NavLink
              key={tab.id}
              to={tab.url}
              end={tab.end}
              style={({ isActive }) => ({
                padding: "12px 16px",
                textDecoration: "none",
                fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
                fontSize: 14,
                fontWeight: isActive ? 600 : 400,
                color: isActive ? "#008060" : "#6d7175",
                borderBottom: isActive ? "2px solid #008060" : "2px solid transparent",
                marginBottom: -1,
                display: "flex",
                alignItems: "center",
                gap: 6,
              })}
            >
              {tab.label}
              {tab.id === "calendar" && scheduledCount > 0 && (
                <span style={{
                  background: "#008060", color: "#fff",
                  borderRadius: 10, fontSize: 11, padding: "1px 7px", fontWeight: 600,
                }}>
                  {scheduledCount}
                </span>
              )}
            </NavLink>
          ))}
        </div>
      </div>

      <Outlet />
    </Page>
  );
}
