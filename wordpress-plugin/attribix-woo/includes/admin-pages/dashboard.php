<?php
/**
 * Admin Page: Dashboard — Overview with KPIs, source breakdown, recent orders.
 */
if ( ! defined( 'ABSPATH' ) ) exit;

use Attribix_Woo\Api;
use Attribix_Woo\Settings;

$settings = Settings::get();
$shop     = Api::shop_domain();
$data     = Api::get( '/api/standalone/overview', array( 'shop' => $shop, 'accountId' => $settings['account_id'] ) );

$revenue   = $data['revenue'] ?? 0;
$orders    = $data['orders'] ?? 0;
$aov       = $data['aov'] ?? 0;
$spend     = $data['spend'] ?? 0;
$roas      = $data['roas'] ?? 0;
$visitors  = $data['visitors'] ?? 0;
$sources   = $data['sources'] ?? array();
$recent    = $data['recentOrders'] ?? array();
$currency  = $data['currency'] ?? 'USD';
?>
<div class="wrap ax-wrap">
	<h1 style="display:flex;align-items:center;gap:10px;margin-bottom:4px;">
		<span style="font-size:28px;">📊</span> Attribix Dashboard
	</h1>
	<p style="color:#6b7280;margin:0 0 20px;">Analytics overview for <strong><?php echo esc_html( $shop ); ?></strong></p>

	<!-- KPI Cards -->
	<div class="ax-cards">
		<div class="ax-card">
			<p class="ax-card-label">Revenue (30d)</p>
			<p class="ax-card-value">$<?php echo number_format( $revenue, 2 ); ?></p>
		</div>
		<div class="ax-card">
			<p class="ax-card-label">Orders</p>
			<p class="ax-card-value"><?php echo (int) $orders; ?></p>
		</div>
		<div class="ax-card">
			<p class="ax-card-label">Avg Order Value</p>
			<p class="ax-card-value">$<?php echo number_format( $aov, 2 ); ?></p>
		</div>
		<div class="ax-card">
			<p class="ax-card-label">Ad Spend</p>
			<p class="ax-card-value">$<?php echo number_format( $spend, 2 ); ?></p>
		</div>
		<div class="ax-card">
			<p class="ax-card-label">ROAS</p>
			<p class="ax-card-value" style="color:<?php echo $roas >= 1 ? '#16a34a' : '#dc2626'; ?>">
				<?php echo number_format( $roas, 2 ); ?>x
			</p>
		</div>
		<div class="ax-card">
			<p class="ax-card-label">Visitors</p>
			<p class="ax-card-value"><?php echo (int) $visitors; ?></p>
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
				<?php foreach ( $daily as $i => $d ) :
					$rev_h = round( ( ( $d['revenue'] ?? 0 ) / $max_val ) * 100 );
					$spd_h = round( ( ( $d['spend'] ?? 0 ) / $max_val ) * 100 );
				?>
					<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:1px;height:100%;justify-content:flex-end;" title="<?php echo esc_attr( $d['date'] ?? '' ); ?>: $<?php echo number_format( $d['revenue'] ?? 0, 0 ); ?> rev / $<?php echo number_format( $d['spend'] ?? 0, 0 ); ?> spend">
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
					<thead>
						<tr><th>Source</th><th>Visitors</th><th>Orders</th><th>Revenue</th></tr>
					</thead>
					<tbody>
						<?php if ( empty( $sources ) ) : ?>
							<tr><td colspan="4" class="ax-empty">No traffic data yet</td></tr>
						<?php else : ?>
							<?php foreach ( array_slice( $sources, 0, 10 ) as $s ) : ?>
								<tr>
									<td><strong><?php echo esc_html( $s['source'] ?? $s['name'] ?? 'Direct' ); ?></strong></td>
									<td><?php echo (int) ( $s['visitors'] ?? $s['count'] ?? 0 ); ?></td>
									<td><?php echo (int) ( $s['orders'] ?? 0 ); ?></td>
									<td>$<?php echo number_format( $s['revenue'] ?? 0, 2 ); ?></td>
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
					<thead>
						<tr><th>Order</th><th>Revenue</th><th>Source</th><th>Date</th></tr>
					</thead>
					<tbody>
						<?php if ( empty( $recent ) ) : ?>
							<tr><td colspan="4" class="ax-empty">No orders yet</td></tr>
						<?php else : ?>
							<?php foreach ( array_slice( $recent, 0, 10 ) as $o ) : ?>
								<tr>
									<td>#<?php echo esc_html( $o['orderId'] ?? $o['id'] ?? '—' ); ?></td>
									<td>$<?php echo number_format( $o['totalValue'] ?? $o['revenue'] ?? 0, 2 ); ?></td>
									<td>
										<span class="ax-badge ax-badge-blue">
											<?php echo esc_html( $o['utmSource'] ?? $o['source'] ?? 'direct' ); ?>
										</span>
									</td>
									<td style="color:#9ca3af;"><?php echo esc_html( isset( $o['createdAt'] ) ? date( 'M j', strtotime( $o['createdAt'] ) ) : '—' ); ?></td>
								</tr>
							<?php endforeach; ?>
						<?php endif; ?>
					</tbody>
				</table>
			</div>
		</div>
	</div>

	<?php if ( empty( $settings['account_id'] ) ) : ?>
		<div class="notice notice-warning" style="margin-top:20px;">
			<p><strong>Account ID not set.</strong> Go to <a href="<?php echo esc_url( admin_url( 'admin.php?page=attribix-woo-settings' ) ); ?>">Settings</a> to enter your Account ID.</p>
		</div>
	<?php endif; ?>
</div>
