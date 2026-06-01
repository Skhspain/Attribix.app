// app/routes/app.jsx
import { json } from "@remix-run/node";
import { Outlet, useLoaderData } from "@remix-run/react";
import { AppProvider } from "@shopify/shopify-app-remix/react";
import shopify, { authenticate } from "~/shopify.server";

const APP_BASE = (process.env.SHOPIFY_APP_URL || "https://api.attribix.app").replace(/\/$/, "");
const WIDGET_SRC = `${APP_BASE}/reviews/widget.js`;

// Meta Pixel browser-side tracking is handled by the attribix-pixel web pixel
// extension (extensions/attribix-pixel), which forwards events to the backend
// for server-side Meta CAPI delivery. We no longer register a browser ScriptTag
// for the Meta pixel — that path was redundant with the web pixel extension.
//
// The reviews widget is still ScriptTag-based until migrated to a theme app
// extension block. Once migrated, this function + the read_script_tags /
// write_script_tags scopes can be removed entirely.
async function ensureScriptTags(admin) {
  try {
    const existing = await admin.graphql(`
      { scriptTags(first: 20) { edges { node { id src } } } }
    `);
    const body = await existing.json();
    const tags = body?.data?.scriptTags?.edges ?? [];
    const existingSrcs = tags.map((e) => e.node.src);

    // Register reviews widget if missing
    if (!existingSrcs.some((s) => s.includes("reviews/widget"))) {
      await admin.graphql(`
        mutation { scriptTagCreate(input: { src: "${WIDGET_SRC}", displayScope: ALL }) { scriptTag { id } userErrors { message } } }
      `);
    }
  } catch (e) {
    console.error("[app] scriptTag registration error:", e?.message ?? e);
  }
}

// Partner / development stores that bypass the billing gate.
// Their plans are managed directly via the Shopify Partner Dashboard.
// Once their subscription is active, getShopPlan() detects it automatically.
// NOTE: Only add stores here if they are true Shopify Partner/dev stores where
// the pricing_plans URL doesn't work. Real merchants should NOT be listed here.
// Dev stores that can't go through Shopify managed pricing.
// Their plan tier is controlled via MANUAL_PLAN_<shop> Fly.io secrets.
// To cut off access: remove from this set AND delete the secret.
const PARTNER_SHOPS = new Set([
]);

export const loader = async ({ request }) => {
  const { session, admin } = await authenticate.admin(request);
  await shopify.registerWebhooks({ session });
  await ensureScriptTags(admin);

  // Gate: require an active plan — redirect to billing page if none selected.
  // Partner shops bypass this gate; their billing is managed via Partner Dashboard.
  const url = new URL(request.url);
  const isBillingPage = url.pathname.startsWith("/app/billing") || url.pathname.startsWith("/app/stripe");
  const isPartner = PARTNER_SHOPS.has(session.shop);
  if (!isBillingPage && !isPartner) {
    const { getShopPlan } = await import("~/services/plan.server");
    const plan = await getShopPlan(session.shop, admin);
    if (plan === "none") {
      const { redirect } = await import("@remix-run/node");
      // Preserve embedded auth params so billing page can authenticate
      const billingUrl = new URL("/app/billing", url.origin);
      for (const [key, val] of url.searchParams.entries()) {
        billingUrl.searchParams.set(key, val);
      }
      return redirect(billingUrl.toString());
    }
  }

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
        {/* Ads & Attribution */}
        <a href="/app/analytics">Analytics</a>
        <a href="/app/meta-ads">Meta Ads</a>
        <a href="/app/google-ads">Google Ads</a>
        {/* <a href="/app/tiktok-ads">TikTok Ads</a> — hidden until TikTok dev app approved */}
        {/* Marketing */}
        <a href="/app/newsletter">Newsletter</a>
        <a href="/app/leads">Lead Center</a>
        <a href="/app/reviews">Reviews</a>
        {/* Tools */}
        <a href="/app/orders">Orders</a>
        <a href="/app/seo">SEO Audit</a>
        <a href="/app/feeds">Feeds</a>
        {/* Setup */}
        <a href="/app/integrations/meta">Integrations</a>
        <a href="/app/settings">Settings</a>
      </ui-nav-menu>
      <Outlet />
    </AppProvider>
  );
}
