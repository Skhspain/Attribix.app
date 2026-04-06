=== Attribix for WooCommerce ===
Contributors: attribix
Tags: analytics, attribution, woocommerce, tracking, utm
Requires at least: 6.0
Tested up to: 6.6
Requires PHP: 7.4
Stable tag: 0.1.0
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Forward WooCommerce storefront and order events to Attribix for attribution analytics.

== Description ==

Attribix for WooCommerce sends storefront page views, product views, add-to-cart, and order events to your Attribix account for attribution reporting.

**Events sent:**

* `page_viewed` — every storefront page
* `product_viewed` — single product pages
* `collection_viewed` — shop / category archives
* `search_submitted` — site search
* `checkout_started` — checkout page
* `product_added_to_cart` — server-side on cart add
* `order_created` — server-side when a Woo order is created
* `checkout_completed` — server-side on thank-you page (fired once per order)

UTM parameters on the landing URL are extracted automatically by the Attribix ingest.

== Installation ==

1. Upload the `attribix-woo` folder to `/wp-content/plugins/`, or install via the Plugins screen.
2. Activate the plugin through the Plugins screen in WordPress.
3. Go to **Settings → Attribix** and enter your Attribix Account ID.

== Frequently Asked Questions ==

= Where do I find my Account ID? =

In your Attribix dashboard.

= Can I self-host the ingest endpoint? =

Yes — change the "Ingest endpoint" field in Settings → Attribix.

= Does this work without WooCommerce? =

No. This plugin requires WooCommerce for order and cart tracking. Page-view tracking will still work, but the Woo hooks will not fire.

== Changelog ==

= 0.1.0 =
* Initial release.
