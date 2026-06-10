// app/routes/app.jsx
import { json } from "@remix-run/node";
import { Outlet, useLoaderData, useNavigation } from "@remix-run/react";
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

// Throttle per-shop setup (webhook registration + script tags) so these
// expensive Shopify API calls don't block every single page navigation.
// One run per shop per hour per server process is more than enough.
const lastSetupMs = new Map();
const SETUP_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

function runSetupFireAndForget(shop, session, admin) {
  const now = Date.now();
  const last = lastSetupMs.get(shop) ?? 0;
  if (now - last < SETUP_INTERVAL_MS) return;
  lastSetupMs.set(shop, now);

  // Fire-and-forget — never await; page response is not blocked
  shopify.registerWebhooks({ session }).catch((e) =>
    console.error("[app] webhook reg error:", e?.message)
  );
  ensureScriptTags(admin).catch((e) =>
    console.error("[app] scriptTag error:", e?.message)
  );
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
  // Run webhook registration + script tag setup at most once per hour.
  // Non-blocking — response is not delayed by these Shopify API calls.
  runSetupFireAndForget(session.shop, session, admin);

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
  currentUrl,
  nextUrl,
  defaultShouldRevalidate,
}) {
  const normalizedMethod =
    typeof formMethod === "string" ? formMethod.toUpperCase() : "";
  const isPost = normalizedMethod === "POST";

  // Settings POST: skip if the action already succeeded
  const isSettingsPost =
    isPost &&
    typeof formAction === "string" &&
    formAction.includes("/app/settings");
  if (isSettingsPost && actionResult?.ok) return false;

  // Always re-run for POSTs (form submissions may change billing state)
  if (isPost) return true;

  // Always re-run when entering or leaving the billing page
  const involvesBilling =
    (currentUrl?.pathname ?? "").includes("/billing") ||
    (nextUrl?.pathname ?? "").includes("/billing");
  if (involvesBilling) return true;

  // For regular GET navigations between app pages, skip re-running the
  // top-level loader. The billing gate, webhook reg, and script tag checks
  // were already done when the app first loaded. Rerunning them on every
  // click is the main source of the per-navigation Shopify API calls.
  return false;
}

export default function AppRoute() {
  const { apiKey } = useLoaderData();
  const navigation = useNavigation();
  const isNavigating = navigation.state !== "idle";

  return (
    <AppProvider apiKey={apiKey} isEmbeddedApp>
      {isNavigating && (
        <div style={{
          position: "fixed", top: 0, left: 0, right: 0,
          height: 3, background: "#008060",
          zIndex: 9999,
          animation: "attribix-progress 1.2s ease-in-out infinite",
          borderRadius: "0 2px 2px 0",
          transformOrigin: "left center",
        }} />
      )}
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
