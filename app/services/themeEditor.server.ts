// app/services/themeEditor.server.ts
// Theme editor deep links for the attribix-tracker theme app extension, plus
// cleanup of the legacy ScriptTags it replaces.
//
// Shopify stops accepting scriptTagCreate on Oct 1, 2026 and existing
// ScriptTags stop running on Mar 1, 2027. Storefront widgets are now shipped
// via the "Attribix Widgets" app embed and the Reviews / Buy Now app blocks.

const API_KEY = process.env.SHOPIFY_API_KEY || "e56855f068d35fe1fc96e73bf90ae937";

// Block handles = file names in extensions/attribix-tracker/blocks/
export const WIDGETS_EMBED = "widgets";
export const BUY_NOW_BLOCK = "buy-now-button";
export const REVIEWS_BLOCK = "reviews";

/** Opens the theme editor's App embeds panel with the given embed switched on. */
export function appEmbedUrl(shop: string, handle: string = WIDGETS_EMBED) {
  return `https://${shop}/admin/themes/current/editor?context=apps&activateAppId=${API_KEY}/${handle}`;
}

/** Opens the theme editor on a template and adds the given app block to its main section. */
export function appBlockUrl(shop: string, handle: string, template = "product") {
  return `https://${shop}/admin/themes/current/editor?template=${template}&addAppBlockId=${API_KEY}/${handle}&target=mainSection`;
}

// ─── Legacy ScriptTags ───────────────────────────────────────────────────────

const LEGACY_SRC_PATTERNS = [
  "/reviews/widget.js",
  "/scripts/buy-now.js",
  "/scripts/newsletter-widget.js",
  "/pixel/loader.js",
];

type Admin = { graphql: (query: string, opts?: any) => Promise<Response> };

// Per-shop cache so the app layout doesn't query ScriptTags on every load.
const legacyCache = new Map<string, { ids: string[]; at: number }>();
const CACHE_MS = 60 * 60 * 1000;

async function fetchLegacyScriptTagIds(admin: Admin): Promise<string[]> {
  const res = await admin.graphql(`{ scriptTags(first: 50) { edges { node { id src } } } }`);
  const body: any = await res.json();
  const edges = body?.data?.scriptTags?.edges ?? [];
  return edges
    .filter((e: any) => LEGACY_SRC_PATTERNS.some((p) => String(e.node?.src ?? "").includes(p)))
    .map((e: any) => e.node.id as string);
}

/** True if the shop still has ScriptTags that should be replaced by the app embed. */
export async function hasLegacyScriptTags(shop: string, admin: Admin): Promise<boolean> {
  const cached = legacyCache.get(shop);
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.ids.length > 0;
  try {
    const ids = await fetchLegacyScriptTagIds(admin);
    legacyCache.set(shop, { ids, at: Date.now() });
    return ids.length > 0;
  } catch (e: any) {
    console.error("[themeEditor] scriptTags query error:", e?.message ?? e);
    return false;
  }
}

// ─── Embed detection ─────────────────────────────────────────────────────────

// Rendered by extensions/attribix-tracker/blocks/widgets.liquid whenever the
// embed is on, so the live storefront HTML tells us whether it was saved.
const EMBED_MARKER = "data-attribix-widgets-embed";

const embedCache = new Map<string, { live: boolean; at: number }>();
const EMBED_CACHE_MS = 5 * 60 * 1000;

/**
 * True if the shop's published theme renders the Attribix Widgets embed.
 * Fetches the storefront homepage; password-protected stores still render
 * app embeds on the password page. Returns false on any fetch error.
 */
export async function isWidgetsEmbedLive(shop: string, { fresh = false } = {}): Promise<boolean> {
  const cached = embedCache.get(shop);
  if (!fresh && cached && Date.now() - cached.at < EMBED_CACHE_MS) return cached.live;
  let live = false;
  try {
    const res = await fetch(`https://${shop}/?attribix_embed_check=${Date.now()}`, {
      redirect: "follow",
      headers: { "User-Agent": "Attribix-EmbedCheck/1.0", "Cache-Control": "no-cache" },
      signal: AbortSignal.timeout(8000),
    });
    live = (await res.text()).includes(EMBED_MARKER);
  } catch (e: any) {
    console.error("[themeEditor] embed check error:", e?.message ?? e);
  }
  embedCache.set(shop, { live, at: Date.now() });
  return live;
}

/**
 * True if the legacy-ScriptTag banner should still be shown. When the embed is
 * already live, removes the old ScriptTags so widgets don't load twice.
 */
export async function needsEmbedMigration(shop: string, admin: Admin, opts: { fresh?: boolean } = {}): Promise<boolean> {
  if (!(await hasLegacyScriptTags(shop, admin))) return false;
  if (!(await isWidgetsEmbedLive(shop, opts))) return true;
  try {
    await removeLegacyScriptTags(shop, admin);
    return false;
  } catch (e: any) {
    console.error("[themeEditor] auto-remove scriptTags error:", e?.message ?? e);
    return true;
  }
}

/** Deletes all legacy Attribix ScriptTags. Call once the merchant has enabled the app embed. */
export async function removeLegacyScriptTags(shop: string, admin: Admin): Promise<number> {
  const ids = await fetchLegacyScriptTagIds(admin);
  for (const id of ids) {
    await admin.graphql(
      `mutation ($id: ID!) { scriptTagDelete(id: $id) { deletedScriptTagId userErrors { message } } }`,
      { variables: { id } },
    );
  }
  legacyCache.set(shop, { ids: [], at: Date.now() });
  return ids.length;
}
