// app/routes/app.social.tsx
// Social Media hub — layout with tabs for Compose / Calendar / Analytics / Accounts.

import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { Outlet, useLoaderData, NavLink, useRouteError } from "@remix-run/react";
import { authenticate } from "~/shopify.server";
import db from "~/db.server";
import { Page } from "@shopify/polaris";

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const anyDb = db as any;

  let totalPosts = 0, scheduledCount = 0;
  let accounts: any[] = [];
  let metaConnected = false;

  try {
    [totalPosts, scheduledCount, accounts] = await Promise.all([
      anyDb.socialPost.count({ where: { shop, status: "published" } }),
      anyDb.socialPost.count({ where: { shop, status: "scheduled" } }),
      anyDb.socialAccount.findMany({ where: { shop, connected: true } }),
    ]);
  } catch {}

  try {
    metaConnected = !!(await anyDb.metaConnection.findUnique({ where: { shop } }));
  } catch {}

  const connectedPlatforms = accounts.map((a: any) => a.platform);
  return json({ totalPosts, scheduledCount, connectedPlatforms, metaConnected });
}

const TABS = [
  { id: "compose",   label: "Compose",   url: "/app/social",            end: true },
  { id: "calendar",  label: "Calendar",  url: "/app/social/calendar",   end: false },
  { id: "analytics", label: "Analytics", url: "/app/social/analytics",  end: false },
  { id: "accounts",  label: "Accounts",  url: "/app/social/accounts",   end: false },
];

export function ErrorBoundary() {
  const error = useRouteError();
  return (
    <div style={{ padding: 24, fontFamily: "monospace" }}>
      <h2 style={{ color: "#ef4444" }}>Social Media — Render Error</h2>
      <pre style={{ background: "#fef2f2", padding: 16, borderRadius: 8, overflow: "auto", fontSize: 12 }}>
        {error instanceof Error ? `${error.message}\n\n${error.stack}` : String(error)}
      </pre>
    </div>
  );
}

export default function SocialLayout() {
  const { scheduledCount } = useLoaderData<typeof loader>();

  return (
    <Page title="Social Media">
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
