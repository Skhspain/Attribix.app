=== Attribix for WooCommerce ===
Contributors: attribix
Tags: analytics, attribution, woocommerce, tracking, meta ads, google ads, newsletter, reviews
Requires at least: 6.0
Tested up to: 6.7
Requires PHP: 7.4
Stable tag: 1.0.0
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

First-party attribution, ad tracking, reviews, newsletter, and analytics for WooCommerce — powered by Attribix.

== Description ==

Attribix connects your WooCommerce store to the Attribix analytics platform. It captures storefront events with first-party cookies that survive iOS 14.5+, ad blockers, and cookie restrictions — giving you attribution data that Meta and Google alone cannot provide.

**Features:**

* **Attribution analytics** — See exactly which traffic sources drive revenue, with full UTM and click-ID tracking (fbclid, gclid, ttclid, msclkid)
* **Meta Ads dashboard** — Campaign and ad performance pulled directly from Meta, including ROAS, spend, and purchase value
* **Google Ads dashboard** — Google Ads campaign performance with conversion tracking
* **Server-side event tracking** — Order events sent server-to-server so they are never lost to browser restrictions
* **Pixel management** — Inject and manage Meta Pixel, Google Tag (GA4), and TikTok Pixel from one place
* **Newsletter** — Subscriber management, campaign editor, and automation flows
* **Reviews** — Product review collection and display
* **Lead Center** — Capture and manage leads from your store
* **Product Feeds** — Generate Google Shopping and Meta Catalog feeds
* **UTM Builder** — Create tracked campaign links
* **SEO Audit** — On-page SEO scoring for products

**Events tracked:**

* `page_viewed` — every storefront page
* `product_viewed` — single product pages
* `collection_viewed` — shop / category archives
* `search_submitted` — site search
* `checkout_started` — checkout page
* `product_added_to_cart` — client and server-side on cart add
* `order_created` — server-side when a WooCommerce order is created
* `checkout_completed` — server-side on the thank-you page (fired once per order)
* `order_refunded` — full and partial refund events with line items
* `order_status_changed` — status transitions

UTM parameters and click IDs on the landing URL are captured in first-party cookies and attached to all events.

== Installation ==

1. Upload the `attribix-woo` folder to `/wp-content/plugins/`, or install via the WordPress Plugins screen.
2. Activate the plugin through the Plugins screen.
3. Go to **Attribix → Settings** and click **Connect Your Store** to link your store to Attribix automatically.
4. Optionally add your Meta Pixel ID, GA4 Measurement ID, or TikTok Pixel ID under the **Tracking Pixels** tab.

== Frequently Asked Questions ==

= Do I need a separate Attribix account? =

Yes. Visit [attribix.app](https://attribix.app) to sign up. The plugin will auto-create your account on first connection.

= Where do I find my Account ID? =

In your Attribix dashboard under Settings. The plugin can also retrieve this automatically via the one-click connect flow.

= Can I self-host the ingest endpoint? =

Yes — change the "Ingest endpoint" field in **Attribix → Settings → General**.

= Does this work without WooCommerce? =

No. This plugin requires WooCommerce for order and cart event tracking. Storefront page-view tracking will still work without WooCommerce.

= Is this compatible with WooCommerce HPOS? =

Yes. The plugin declares compatibility with WooCommerce High-Performance Order Storage (custom_order_tables).

== Changelog ==

= 1.0.0 =
* Full admin interface: Dashboard, Meta Ads, Google Ads, Attribution, Orders, Newsletter, Reviews, Leads, SEO, UTM Builder, Product Feeds, Billing
* One-click store connection flow
* Meta OAuth integration with ad account and pixel picker
* Google OAuth integration
* Server-side and client-side event tracking
* Meta Pixel, Google Tag (GA4), and TikTok Pixel injection
* First-party cookie visitor and session tracking
* UTM and click ID capture (fbclid, gclid, ttclid, msclkid)
* Newsletter widget shortcode [attribix_newsletter]
* WooCommerce HPOS compatibility
* Order refund and status-change events
