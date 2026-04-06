# Attribix WordPress Plugin

WordPress/WooCommerce plugin that forwards storefront and order events to the Attribix ingest API (`POST /api/track` on the Remix backend).

## Layout

```
wordpress-plugin/
  attribix-woo/
    attribix-woo.php           # plugin bootstrap
    readme.txt                 # wordpress.org plugin directory manifest
    includes/
      class-http.php           # wp_remote_post wrapper
      class-settings.php       # Settings → Attribix admin page
      class-tracker.php        # storefront script enqueue + page context
      class-server-events.php  # Woo action hooks (orders, cart)
    assets/
      js/attribix.js           # storefront tracker (page_viewed, product_viewed, etc.)
```

## Install (self-hosted)

1. Zip the `attribix-woo/` folder: `cd wordpress-plugin && zip -r attribix-woo.zip attribix-woo`
2. In WP admin: **Plugins → Add New → Upload Plugin** → select the zip → Install → Activate.
3. **Settings → Attribix** → set Account ID.

## Install (dev / local)

Symlink or copy `attribix-woo/` into `wp-content/plugins/` of your WP install, then activate.

## Event shape

All events POST JSON to the configured endpoint (default `https://api.attribix.app/api/track`):

```json
{
  "type": "page_viewed",
  "accountID": "<from settings>",
  "event": { "name": "...", "data": {...}, "context": {...} },
  "meta": { "t": "iso", "platform": "woocommerce", "source": "client|server", "site": "https://..." }
}
```

This matches the payload shape produced by the Shopify web-pixel extension, so the ingest route needs no changes.

## Events

| Event | Fired | Source |
|---|---|---|
| `page_viewed` | every storefront page load | client JS |
| `product_viewed` | product detail page | client JS |
| `collection_viewed` | shop / product category | client JS |
| `search_submitted` | `?s=` search page | client JS |
| `checkout_started` | checkout page (not thank-you) | client JS |
| `product_added_to_cart` | `woocommerce_add_to_cart` | PHP hook |
| `order_created` | `woocommerce_new_order` | PHP hook |
| `checkout_completed` | `woocommerce_thankyou` (once per order) | PHP hook |

## wordpress.org directory submission

The plugin already ships with a compliant `readme.txt`. To submit:

1. Request hosting: https://wordpress.org/plugins/developers/add/
2. Once approved, commit the `attribix-woo/` contents into the assigned SVN `trunk/` and tag a release.

## Testing checklist

- [ ] Install plugin, activate — no PHP errors in debug.log
- [ ] Settings → Attribix shows with Account ID field
- [ ] Front page loads → `page_viewed` hits `/api/track` (check browser Network tab + fly logs)
- [ ] Product page → `product_viewed` with product id/title/price
- [ ] Add-to-cart → `product_added_to_cart` arrives server-side
- [ ] Place test order → `order_created` + `checkout_completed` fire once each
- [ ] `?utm_source=test&utm_medium=x&utm_campaign=y` on landing preserves UTMs in DB
