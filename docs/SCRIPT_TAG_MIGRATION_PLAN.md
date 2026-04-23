# ScriptTag Migration Plan

Shopify is phasing out the ScriptTag API in favor of theme app extensions and
app embed blocks. This document tracks our migration progress and plan.

## Status

| Feature | Current | Target | Status |
|---|---|---|---|
| Meta Pixel (browser) | — | `attribix-pixel` web pixel extension | ✅ Migrated |
| Reviews widget | `/reviews/widget.js` ScriptTag | Theme app extension block | ⏳ Planned |
| Buy Now button | `buy-now.js` ScriptTag | Theme app extension block | ⏳ Planned |
| Newsletter widget | `newsletter.js` ScriptTag | Theme app extension block | ⏳ Planned |

## Why this is staged

Migrating widgets to theme app extensions is merchant-breaking: existing
installs rely on automatic ScriptTag injection, but theme app extensions
require merchants to **manually add an app block** to their theme. We're
migrating in stages to avoid a hard break for existing users and to keep
the App Store review cycle stable.

## Completed migration: Meta Pixel

The `attribix-pixel` web pixel extension in `extensions/attribix-pixel`
subscribes to storefront and checkout events, captures visitor/session IDs
and click IDs, and forwards events to `/api/track` for server-side Meta
CAPI delivery. This fully replaces the browser-side `fbq('track',
'PageView')` the ScriptTag previously loaded.

ScriptTag registration for the pixel loader was removed from
`ensureScriptTags()` in `app/routes/app.jsx`. The `/pixel/loader.js` route
is retained temporarily so existing installs that have a ScriptTag on file
continue working until the merchant reinstalls; it will be removed in a
future cleanup.

## Planned migration: Reviews widget

**Current:** ScriptTag points to `/reviews/widget.js`, which injects a
`<div>` into the storefront DOM and fetches reviews for the current
product.

**Target:** Add a `reviews` block to the existing `attribix-tracker`
theme app extension (or create a new `attribix-reviews` theme app
extension). Merchants add the block to their product page theme
template. The block renders server-rendered Liquid that fetches reviews
via the App Proxy.

**Risks:**
- Existing merchants need to manually add the block to their theme
- Reviews will disappear from live stores until the block is added
- Requires merchant-facing onboarding flow change

## Planned migration: Buy Now button

**Current:** ScriptTag auto-injects a "Buy Now" button on product pages
via DOM manipulation (`app/routes/app.buy-now.tsx` registers and
`/buy-now.js` serves the client code).

**Target:** Theme app extension app block that merchants place on their
product page template.

## Planned migration: Newsletter widget

**Current:** ScriptTag auto-injects a newsletter signup widget (file
list + exit intent). Registered in
`app/routes/app.newsletter.widget.tsx`.

**Target:** Theme app extension app block that merchants place on their
page template(s).

## Rollout order

1. **Meta Pixel** (web pixel extension) — ✅ Done
2. **Reviews widget** — migrate first (user-visible but low complexity)
3. **Buy Now button** — migrate second (simpler widget)
4. **Newsletter widget** — migrate last (most complex, multiple display modes)

After step 4:
- Remove `read_script_tags` and `write_script_tags` from `shopify.app.toml`
- Remove `ensureScriptTags()` and `/pixel/loader.js`, `/reviews/widget.js`,
  `/buy-now.js`, `/newsletter.js` routes
- `shopify app deploy` + `fly deploy`

## Reviewer response

If a Shopify reviewer asks about ScriptTag usage, our response is:

> Attribix uses the Shopify web pixel extension (`attribix-pixel`) for
> all analytics and marketing tracking — ScriptTag is not used for
> pixel or event collection. Three merchant-facing UI widgets (reviews
> display, buy-now button, newsletter signup) still ship via ScriptTag
> pending a staged migration to theme app extension blocks documented
> in `docs/SCRIPT_TAG_MIGRATION_PLAN.md`. Migration will avoid breaking
> existing installs by coordinating rollout with a merchant-facing
> onboarding update.
