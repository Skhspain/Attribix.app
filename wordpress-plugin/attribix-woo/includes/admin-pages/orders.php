<?php
/**
 * Admin Page: Orders — Attributed orders with source tracking.
 */
if ( ! defined( 'ABSPATH' ) ) exit;

use Attribix_Woo\Api;
use Attribix_Woo\Settings;

$settings = Settings::get();
$shop     = Api::shop_domain();
$data     = Api::get( '/api/standalone/orders', array( 'shop' => $shop, 'accountId' => $settings['account_id'] ) );

$orders     = $data['orders'] ?? array();
$stats      = $data['stats'] ?? array();
$attributed = $stats['attributed'] ?? 0;
$total      = $stats['total'] ?? count( $orders );
$rate       = $total > 0 ? round( ( $attributed / $total ) * 100 ) : 0;
?>
<div class="wrap ax-wrap">
	<h1 style="display:flex;align-items:center;gap:10px;">
		<span style="font-size:24px;">📦</span> Orders
	</h1>

	<div class="ax-cards" style="grid-template-columns:repeat(4,1fr);">
		<div class="ax-card">
			<p class="ax-card-label">Total Orders</p>
			<p class="ax-card-value"><?php echo (int) $total; ?></p>
		</div>
		<div class="ax-card">
			<p class="ax-card-label">Attributed</p>
			<p class="ax-card-value" style="color:#16a34a;"><?php echo (int) $attributed; ?></p>
		</div>
		<div class="ax-card">
			<p class="ax-card-label">Attribution Rate</p>
			<p class="ax-card-value"><?php echo $rate; ?>%</p>
		</div>
		<div class="ax-card">
			<p class="ax-card-label">Total Revenue</p>
			<p class="ax-card-value">$<?php echo number_format( $stats['revenue'] ?? 0, 2 ); ?></p>
		</div>
	</div>

	<div class="ax-table-wrap">
		<table class="ax-table">
			<thead>
				<tr>
					<th>Order</th><th>Revenue</th><th>Source</th><th>Campaign</th><th>Date</th>
				</tr>
			</thead>
			<tbody>
				<?php if ( empty( $orders ) ) : ?>
					<tr><td colspan="5" class="ax-empty">No orders yet. Orders will appear here once tracked.</td></tr>
				<?php else : ?>
					<?php foreach ( array_slice( $orders, 0, 100 ) as $o ) : ?>
						<tr>
							<td><strong>#<?php echo esc_html( $o['orderId'] ?? $o['id'] ?? '—' ); ?></strong></td>
							<td>$<?php echo number_format( $o['totalValue'] ?? $o['revenue'] ?? 0, 2 ); ?></td>
							<td>
								<?php
								$src = $o['utmSource'] ?? $o['source'] ?? 'direct';
								$tone = 'gray';
								if ( stripos( $src, 'meta' ) !== false || stripos( $src, 'facebook' ) !== false ) $tone = 'blue';
								elseif ( stripos( $src, 'google' ) !== false ) $tone = 'green';
								elseif ( stripos( $src, 'tiktok' ) !== false ) $tone = 'yellow';
								elseif ( stripos( $src, 'email' ) !== false ) $tone = 'green';
								?>
								<span class="ax-badge ax-badge-<?php echo $tone; ?>"><?php echo esc_html( $src ); ?></span>
							</td>
							<td style="color:#6b7280;font-size:12px;"><?php echo esc_html( $o['utmCampaign'] ?? '—' ); ?></td>
							<td style="color:#9ca3af;"><?php echo esc_html( isset( $o['createdAt'] ) ? date( 'M j, Y', strtotime( $o['createdAt'] ) ) : '—' ); ?></td>
						</tr>
					<?php endforeach; ?>
				<?php endif; ?>
			</tbody>
		</table>
	</div>
</div>
