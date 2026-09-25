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
