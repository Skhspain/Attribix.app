<?php
/**
 * Admin Page: Dashboard — Overview with KPIs, ad tiles, badges, and sales comparison.
 * Matches the Shopify app dashboard feature set.
 */
if ( ! defined( 'ABSPATH' ) ) exit;

use Attribix_Woo\Api;
use Attribix_Woo\Settings;

$settings = Settings::get();
$shop     = Api::shop_domain();
$is_connected = \Attribix_Woo\Setup::is_connected();

if ( ! $is_connected ) {
	?>
	<div class="wrap ax-wrap">
		<h1 style="display:flex;align-items:center;gap:10px;"><span style="font-size:28px;">📊</span> Attribix Dashboard</h1>
		<div style="text-align:center;padding:60px 20px;max-width:500px;margin:40px auto;">
			<span style="font-size:64px;">🚀</span>
			<h2 style="margin:16px 0 8px;">Welcome to Attribix!</h2>
			<p style="color:#6b7280;font-size:15px;line-height:1.6;">Connect your store to start tracking analytics, ad performance, attribution, and more.</p>
			<a href="<?php echo esc_url( admin_url( 'admin.php?page=attribix-woo-settings' ) ); ?>" class="button button-primary button-hero" style="margin-top:20px;font-size:16px;">Connect Your Store →</a>
		</div>
	</div>
	<?php
	return;
}

// Fetch all dashboard data
$data      = Api::get( '/api/standalone/overview', array( 'shop' => $shop, 'accountId' => $settings['account_id'] ) );
$meta_data = Api::get( '/api/standalone/meta-ads', array( 'days' => 7 ) );
$google_data = Api::get( '/api/standalone/google-ads', array( 'days' => 7 ) );
$status    = Api::get( '/api/woo/status', array( 'shop' => $shop ) );

$revenue   = $data['revenue'] ?? 0;
$orders    = $data['orders'] ?? 0;
$aov       = $data['aov'] ?? 0;
$spend     = $data['spend'] ?? 0;
$roas      = $data['roas'] ?? 0;
$visitors  = $data['visitors'] ?? 0;
$sources   = $data['sources'] ?? array();
$recent    = $data['recentOrders'] ?? array();
$currency  = $data['currency'] ?? get_woocommerce_currency();

// Ad platform data
$meta_spend   = $meta_data['totals']['spend'] ?? 0;
$meta_revenue = $meta_data['totals']['value'] ?? $meta_data['totals']['purchaseValue'] ?? 0;
$google_spend = $google_data['totals']['spend'] ?? 0;
$google_revenue = $google_data['totals']['value'] ?? $google_data['totals']['conversionValue'] ?? 0;

// Notification counts
$pending_reviews = 0;
$new_leads = 0;
$new_subs = 0;
try {
	global $wpdb;
	// Use WooCommerce's review count as a proxy
	$pending_reviews = (int) $wpdb->get_var( "SELECT COUNT(*) FROM {$wpdb->comments} WHERE comment_type='review' AND comment_approved='0'" );
} catch ( \Exception $e ) {}

// Format helper
function ax_money( $amount, $currency = 'USD' ) {
	if ( function_exists( 'wc_price' ) ) {
		return strip_tags( wc_price( $amount, array( 'currency' => $currency ) ) );
	}
	return $currency . ' ' . number_format( $amount, 2 );
}

$cur = $currency;
?>
<div class="wrap ax-wrap">
	<h1 style="display:flex;align-items:center;gap:10px;margin-bottom:4px;">
		<span style="font-size:28px;">📊</span> Attribix Dashboard
	</h1>
	<p style="color:#6b7280;margin:0 0 20px;">Analytics overview for <strong><?php echo esc_html( $shop ); ?></strong></p>

	<!-- KPI Cards -->
	<div class="ax-cards">
		<div class="ax-card"><p class="ax-card-label">Revenue (30d)</p><p class="ax-card-value"><?php echo ax_money( $revenue, $cur ); ?></p></div>
		<div class="ax-card"><p class="ax-card-label">Orders</p><p class="ax-card-value"><?php echo (int) $orders; ?></p></div>
		<div class="ax-card"><p class="ax-card-label">Avg Order Value</p><p class="ax-card-value"><?php echo ax_money( $aov, $cur ); ?></p></div>
		<div class="ax-card"><p class="ax-card-label">Ad Spend (7d)</p><p class="ax-card-value"><?php echo ax_money( $meta_spend + $google_spend, $cur ); ?></p></div>
		<div class="ax-card">
			<p class="ax-card-label">ROAS</p>
			<p class="ax-card-value" style="color:<?php echo $roas >= 1 ? '#16a34a' : '#dc2626'; ?>"><?php echo number_format( $roas, 2 ); ?>x</p>
		</div>
		<div class="ax-card"><p class="ax-card-label">Visitors</p><p class="ax-card-value"><?php echo (int) $visitors; ?></p></div>
	</div>

	<!-- Shopify vs Ad Platform Sales Comparison (only when platforms report 20%+ more) -->
	<?php
	$ad_total_rev = $meta_revenue + $google_revenue;
	$shopify_rev7 = $data['rev7'] ?? $revenue; // fallback to 30d if 7d not available
	$sales_pct = $shopify_rev7 > 0 ? round( ( ( $ad_total_rev - $shopify_rev7 ) / $shopify_rev7 ) * 100 ) : 0;
	if ( $sales_pct >= 20 ) :
	?>
	<div style="background:#fff;border:1px solid #e5e7eb;border-radius:8px;padding:20px;margin:20px 0;">
		<h2 class="ax-section-title">Store Sales vs Ad Platform Reported (7d)</h2>
		<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-top:12px;">
			<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:14px 16px;">
				<p style="font-size:12px;color:#6b7280;margin:0 0 4px;">Store Revenue</p>
				<p style="font-size:20px;font-weight:700;margin:0;"><?php echo ax_money( $shopify_rev7, $cur ); ?></p>
			</div>
			<div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:14px 16px;">
				<p style="font-size:12px;color:#6b7280;margin:0 0 4px;">Ad Platform Reported</p>
				<p style="font-size:20px;font-weight:700;margin:0;"><?php echo ax_money( $ad_total_rev, $cur ); ?></p>
				<p style="font-size:11px;color:#6b7280;margin:4px 0 0;">Meta: <?php echo ax_money( $meta_revenue, $cur ); ?> · Google: <?php echo ax_money( $google_revenue, $cur ); ?></p>
			</div>
			<div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:14px 16px;">
				<p style="font-size:12px;color:#6b7280;margin:0 0 4px;">Difference</p>
				<p style="font-size:20px;font-weight:700;margin:0;">+<?php echo $sales_pct; ?>%</p>
				<p style="font-size:11px;color:#6b7280;margin:4px 0 0;">Ad platforms report more (includes view-through conversions)</p>
			</div>
		</div>
	</div>
	<?php endif; ?>

	<!-- Feature Hub — Ad platforms first -->
	<div style="background:#fff;border:1px solid #e5e7eb;border-radius:8px;padding:20px;margin:20px 0;">
		<h2 class="ax-section-title">Your Attribix Tools</h2>
		<div style="display:grid;grid-template-columns:repeat(auto-fill, minmax(180px, 1fr));gap:12px;margin-top:12px;">
			<?php
			$tools = array(
				array(
					'icon' => '📘', 'title' => 'Meta Ads', 'url' => 'attribix-meta-ads',
					'line1' => ax_money( $meta_spend, $cur ) . ' spend',
					'line2' => 'Sales: ' . ax_money( $meta_revenue, $cur ),
					'badge' => 0,
				),
				array(
					'icon' => '📈', 'title' => 'Google Ads', 'url' => 'attribix-google-ads',
					'line1' => ax_money( $google_spend, $cur ) . ' spend',
					'line2' => 'Sales: ' . ax_money( $google_revenue, $cur ),
					'badge' => 0,
				),
				array( 'icon' => '📊', 'title' => 'Analytics', 'url' => 'attribix-woo', 'line1' => 'Revenue & attribution', 'badge' => 0 ),
				array( 'icon' => '📦', 'title' => 'Orders', 'url' => 'attribix-orders', 'line1' => $orders . ' in 30 days', 'badge' => 0 ),
				array( 'icon' => '📧', 'title' => 'Newsletter', 'url' => 'attribix-newsletter', 'line1' => 'Subscribers & sends', 'badge' => $new_subs ),
				array( 'icon' => '⭐', 'title' => 'Reviews', 'url' => 'attribix-reviews', 'line1' => 'Product reviews', 'badge' => $pending_reviews ),
				array( 'icon' => '👥', 'title' => 'Lead Center', 'url' => 'attribix-leads', 'line1' => 'Manage leads', 'badge' => $new_leads ),
				array( 'icon' => '🔍', 'title' => 'SEO Audit', 'url' => 'attribix-seo', 'line1' => 'Score products', 'badge' => 0 ),
				array( 'icon' => '🔗', 'title' => 'Product Feeds', 'url' => 'attribix-feeds', 'line1' => 'Google & Meta', 'badge' => 0 ),
				array( 'icon' => '🏷️', 'title' => 'UTM Builder', 'url' => 'attribix-utm', 'line1' => 'Create tracked links', 'badge' => 0 ),
				array( 'icon' => '💳', 'title' => 'Billing', 'url' => 'attribix-billing', 'line1' => 'Plans & subscription', 'badge' => 0 ),
				array( 'icon' => '⚙️', 'title' => 'Settings', 'url' => 'attribix-woo-settings', 'line1' => 'Configuration', 'badge' => 0 ),
			);
			foreach ( $tools as $tool ) :
				$page_url = admin_url( 'admin.php?page=' . $tool['url'] );
			?>
				<a href="<?php echo esc_url( $page_url ); ?>" style="position:relative;border:1px solid #e1e3e5;border-radius:10px;padding:14px 16px;background:#fff;text-decoration:none;color:inherit;transition:box-shadow 0.15s;display:block;"
					onmouseenter="this.style.boxShadow='0 2px 12px rgba(0,0,0,0.08)'"
					onmouseleave="this.style.boxShadow='none'">
					<?php if ( ! empty( $tool['badge'] ) && $tool['badge'] > 0 ) : ?>
						<div style="position:absolute;top:-6px;right:-6px;background:#dc2626;color:#fff;border-radius:999px;min-width:22px;height:22px;padding:0 7px;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;box-shadow:0 1px 4px rgba(0,0,0,0.15);border:2px solid #fff;">
							+<?php echo (int) $tool['badge']; ?>
						</div>
					<?php endif; ?>
					<div style="font-size:22px;margin-bottom:6px;"><?php echo $tool['icon']; ?></div>
					<div style="font-weight:600;font-size:14px;"><?php echo esc_html( $tool['title'] ); ?></div>
					<div style="font-size:12px;color:#6b7280;margin-top:4px;"><?php echo esc_html( $tool['line1'] ); ?></div>
					<?php if ( ! empty( $tool['line2'] ) ) : ?>
						<div style="font-size:12px;color:#9ca3af;margin-top:2px;"><?php echo esc_html( $tool['line2'] ); ?></div>
					<?php endif; ?>
				</a>
			<?php endforeach; ?>
		</div>
	</div>

	<!-- Revenue Chart -->
	<?php
	$daily = $data['daily'] ?? array();
	if ( ! empty( $daily ) ) :
		$max_val = max( array_map( function( $d ) { return max( $d['revenue'] ?? 0, $d['spend'] ?? 0 ); }, $daily ) );
		if ( $max_val < 1 ) $max_val = 1;
	?>
	<div class="ax-section">
		<h2 class="ax-section-title">Revenue vs Spend (30 days)</h2>
		<div style="background:#fff;border:1px solid #e5e7eb;border-radius:8px;padding:20px;">
			<div style="display:flex;align-items:end;gap:2px;height:160px;">
				<?php foreach ( $daily as $d ) :
					$rev_h = round( ( ( $d['revenue'] ?? 0 ) / $max_val ) * 100 );
					$spd_h = round( ( ( $d['spend'] ?? 0 ) / $max_val ) * 100 );
				?>
					<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:1px;height:100%;justify-content:flex-end;" title="<?php echo esc_attr( $d['date'] ?? '' ); ?>">
						<div style="display:flex;gap:1px;align-items:flex-end;width:100%;">
							<div style="flex:1;background:#6366f1;border-radius:2px 2px 0 0;min-height:2px;height:<?php echo max( $rev_h, 2 ); ?>%;"></div>
							<div style="flex:1;background:#d1d5db;border-radius:2px 2px 0 0;min-height:2px;height:<?php echo max( $spd_h, 2 ); ?>%;"></div>
						</div>
					</div>
				<?php endforeach; ?>
			</div>
			<div style="display:flex;gap:16px;margin-top:12px;font-size:12px;color:#6b7280;">
				<span><span style="display:inline-block;width:12px;height:12px;background:#6366f1;border-radius:2px;vertical-align:middle;margin-right:4px;"></span>Revenue</span>
				<span><span style="display:inline-block;width:12px;height:12px;background:#d1d5db;border-radius:2px;vertical-align:middle;margin-right:4px;"></span>Spend</span>
			</div>
		</div>
	</div>
	<?php endif; ?>

	<div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;">
		<!-- Sources -->
		<div class="ax-section">
			<h2 class="ax-section-title">Traffic Sources</h2>
			<div class="ax-table-wrap">
				<table class="ax-table">
					<thead><tr><th>Source</th><th>Visitors</th><th>Orders</th><th>Revenue</th></tr></thead>
					<tbody>
						<?php if ( empty( $sources ) ) : ?>
							<tr><td colspan="4" class="ax-empty">No traffic data yet</td></tr>
						<?php else : ?>
							<?php foreach ( array_slice( $sources, 0, 10 ) as $s ) : ?>
								<tr>
									<td><strong><?php echo esc_html( $s['source'] ?? $s['name'] ?? 'Direct' ); ?></strong></td>
									<td><?php echo (int) ( $s['visitors'] ?? $s['count'] ?? 0 ); ?></td>
									<td><?php echo (int) ( $s['orders'] ?? 0 ); ?></td>
									<td><?php echo ax_money( $s['revenue'] ?? 0, $cur ); ?></td>
								</tr>
							<?php endforeach; ?>
						<?php endif; ?>
					</tbody>
				</table>
			</div>
		</div>

		<!-- Recent Orders -->
		<div class="ax-section">
			<h2 class="ax-section-title">Recent Orders</h2>
			<div class="ax-table-wrap">
				<table class="ax-table">
					<thead><tr><th>Order</th><th>Revenue</th><th>Source</th><th>Date</th></tr></thead>
					<tbody>
						<?php if ( empty( $recent ) ) : ?>
							<tr><td colspan="4" class="ax-empty">No orders yet</td></tr>
						<?php else : ?>
							<?php foreach ( array_slice( $recent, 0, 10 ) as $o ) : ?>
								<tr>
									<td>#<?php echo esc_html( $o['orderId'] ?? $o['id'] ?? '—' ); ?></td>
									<td><?php echo ax_money( $o['totalValue'] ?? $o['revenue'] ?? 0, $cur ); ?></td>
									<td><span class="ax-badge ax-badge-blue"><?php echo esc_html( $o['utmSource'] ?? $o['source'] ?? 'direct' ); ?></span></td>
									<td style="color:#9ca3af;"><?php echo esc_html( isset( $o['createdAt'] ) ? date( 'M j', strtotime( $o['createdAt'] ) ) : '—' ); ?></td>
								</tr>
							<?php endforeach; ?>
						<?php endif; ?>
					</tbody>
				</table>
			</div>
		</div>
	</div>
</div>
