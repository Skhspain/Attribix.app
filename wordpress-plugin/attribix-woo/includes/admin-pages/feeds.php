<?php
/**
 * Admin Page: Product Feeds — Google Shopping, Google Reviews, Meta Catalog.
 */
if ( ! defined( 'ABSPATH' ) ) exit;

use Attribix_Woo\Api;
use Attribix_Woo\Settings;

$settings = Settings::get();
$shop     = Api::shop_domain();
$base_url = str_replace( '/api/track', '', rtrim( $settings['endpoint'] ?? ATTRIBIX_WOO_DEFAULT_ENDPOINT, '/' ) );

// For WooCommerce, feeds can be generated locally
$google_shopping_url = home_url( '/wp-json/attribix/v1/feed/google-shopping' );
$google_reviews_url  = home_url( '/wp-json/attribix/v1/feed/google-reviews' );

$product_count = wp_count_posts( 'product' )->publish ?? 0;
?>
<div class="wrap ax-wrap">
	<h1 style="display:flex;align-items:center;gap:10px;">
		<span style="font-size:24px;">📡</span> Product Feeds
	</h1>

	<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;margin-top:20px;">
		<!-- Google Shopping -->
		<div class="ax-card" style="padding:24px;">
			<h3 style="margin:0 0 8px;">🛒 Google Shopping Feed</h3>
			<p style="color:#6b7280;font-size:13px;">XML feed for Google Merchant Center. Auto-generated from your WooCommerce products.</p>
			<p style="font-size:13px;"><strong><?php echo (int) $product_count; ?></strong> products available</p>
			<div style="margin-top:12px;">
				<div style="background:#f9fafb;padding:8px 12px;border-radius:6px;font-family:monospace;font-size:11px;word-break:break-all;border:1px solid #e5e7eb;">
					<?php echo esc_url( $google_shopping_url ); ?>
				</div>
				<div style="margin-top:8px;display:flex;gap:8px;">
					<button type="button" class="ax-btn" onclick="navigator.clipboard.writeText('<?php echo esc_js( $google_shopping_url ); ?>');this.textContent='Copied!';">Copy URL</button>
					<a href="<?php echo esc_url( $google_shopping_url ); ?>" target="_blank" class="ax-btn">Preview</a>
				</div>
			</div>
		</div>

		<!-- Google Reviews -->
		<div class="ax-card" style="padding:24px;">
			<h3 style="margin:0 0 8px;">⭐ Google Reviews Feed</h3>
			<p style="color:#6b7280;font-size:13px;">XML feed for Google review stars in search results.</p>
			<p style="font-size:13px;">Pulls from your Attribix reviews.</p>
			<div style="margin-top:12px;">
				<div style="background:#f9fafb;padding:8px 12px;border-radius:6px;font-family:monospace;font-size:11px;word-break:break-all;border:1px solid #e5e7eb;">
					<?php echo esc_url( $google_reviews_url ); ?>
				</div>
				<div style="margin-top:8px;display:flex;gap:8px;">
					<button type="button" class="ax-btn" onclick="navigator.clipboard.writeText('<?php echo esc_js( $google_reviews_url ); ?>');this.textContent='Copied!';">Copy URL</button>
					<a href="<?php echo esc_url( $google_reviews_url ); ?>" target="_blank" class="ax-btn">Preview</a>
				</div>
			</div>
		</div>

		<!-- Meta Catalog -->
		<div class="ax-card" style="padding:24px;">
			<h3 style="margin:0 0 8px;">📘 Meta Product Catalog</h3>
			<p style="color:#6b7280;font-size:13px;">Use your Google Shopping feed URL in Meta Commerce Manager for Facebook & Instagram Shops.</p>
			<div style="margin-top:16px;">
				<a href="https://business.facebook.com/commerce/catalogs" target="_blank" class="ax-btn">Open Meta Commerce Manager →</a>
			</div>
		</div>
	</div>

	<div class="notice notice-info" style="margin-top:20px;">
		<p><strong>How to set up:</strong> Copy the Google Shopping Feed URL and paste it in <a href="https://merchants.google.com" target="_blank">Google Merchant Center</a> → Products → Feeds → Add feed → Scheduled fetch.</p>
	</div>
</div>
