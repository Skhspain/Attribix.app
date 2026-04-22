// app/routes/app.jsx
import { json } from "@remix-run/node";
import { Outlet, useLoaderData } from "@remix-run/react";
import { AppProvider } from "@shopify/shopify-app-remix/react";
import shopify, { authenticate } from "~/shopify.server";

const APP_BASE = (process.env.SHOPIFY_APP_URL || "https://api.attribix.app").replace(/\/$/, "");
const WIDGET_SRC = `${APP_BASE}/reviews/widget.js`;

async function ensureScriptTags(admin, shop) {
  const PIXEL_SRC = `${APP_BASE}/pixel/loader.js?shop=${encodeURIComponent(shop)}`;

  try {
    const existing = await admin.graphql(`
      { scriptTags(first: 20) { edges { node { id src } } } }
    `);
    const body = await existing.json();
    const tags = body?.data?.scriptTags?.edges ?? [];
    const existingSrcs = tags.map((e) => e.node.src);

    // Register widget if missing
    if (!existingSrcs.some((s) => s.includes("reviews/widget"))) {
      await admin.graphql(`
        mutation { scriptTagCreate(input: { src: "${WIDGET_SRC}", displayScope: ALL }) { scriptTag { id } userErrors { message } } }
      `);
    }

    // Register pixel loader if missing
    if (!existingSrcs.some((s) => s.includes("pixel/loader"))) {
      await admin.graphql(`
        mutation { scriptTagCreate(input: { src: "${PIXEL_SRC}", displayScope: ALL }) { scriptTag { id } userErrors { message } } }
      `);
    }
  } catch (e) {
    console.error("[app] scriptTag registration error:", e?.message ?? e);
  }
}

export const loader = async ({ request }) => {
  const { session, admin } = await authenticate.admin(request);
  await shopify.registerWebhooks({ session });
  await ensureScriptTags(admin, session.shop);

  return json({
    apiKey:
      process.env.SHOPIFY_API_KEY ||
      process.env.VITE_SHOPIFY_API_KEY ||
      "",
  });
};

export function shouldRevalidate({
  formAction,
  formMethod,
  actionResult,
  defaultShouldRevalidate,
}) {
  const normalizedMethod =
    typeof formMethod === "string" ? formMethod.toUpperCase() : "";
  const isSettingsPost =
    normalizedMethod === "POST" &&
    typeof formAction === "string" &&
    formAction.includes("/app/settings");
  if (isSettingsPost && actionResult?.ok) return false;
  return defaultShouldRevalidate;
}

export default function AppRoute() {
  const { apiKey } = useLoaderData();

  return (
    <AppProvider apiKey={apiKey} isEmbeddedApp>
      {/* ui-nav-menu is an App Bridge web component — renders the embedded app sidebar nav */}
      <ui-nav-menu>
        <a href="/app" rel="home">Overview</a>
        <a href="/app/analytics">Analytics</a>
        <a href="/app/meta-ads">Meta Ads</a>
        <a href="/app/google-ads">Google Ads</a>
        {/* <a href="/app/tiktok-ads">TikTok Ads</a> — hidden until TikTok dev app approved */}
        <a href="/app/leads">Lead Center</a>
        <a href="/app/reviews">Reviews</a>
        <a href="/app/orders">Orders</a>
        <a href="/app/newsletter">Newsletter</a>
        <a href="/app/seo">SEO Audit</a>
        <a href="/app/feeds">Feeds</a>
        <a href="/app/integrations/meta">Integrations</a>
        <a href="/app/settings">Settings</a>
      </ui-nav-menu>
      <Outlet />
    </AppProvider>
  );
}
