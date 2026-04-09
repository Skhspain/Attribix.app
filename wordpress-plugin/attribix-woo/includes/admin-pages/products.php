<?php
/**
 * Admin Page: Product Analytics — Revenue, units, orders per product.
 */
if ( ! defined( 'ABSPATH' ) ) exit;

use Attribix_Woo\Api;
use Attribix_Woo\Settings;

$settings = Settings::get();
$days     = isset( $_GET['days'] ) ? (int) $_GET['days'] : 30;
$data     = Api::get( '/api/standalone/products', array( 'days' => $days ) );

$products = $data['products'] ?? array();
$totals   = $data['totals'] ?? array();
$base     = admin_url( 'admin.php?page=attribix-products' );
?>
<div class="wrap ax-wrap">
	<div class="ax-row">
		<h1 style="display:flex;align-items:center;gap:10px;margin:0;">
			<span style="font-size:24px;">📦</span> Product Analytics
		</h1>
		<div class="ax-spacer"></div>
		<?php foreach ( array( 30, 90, 180 ) as $d ) : ?>
			<a href="<?php echo esc_url( $base . '&days=' . $d ); ?>" class="ax-btn <?php echo $days === $d ? 'ax-btn-primary' : ''; ?>"><?php echo $d; ?>d</a>
		<?php endforeach; ?>
	</div>

	<div class="ax-cards" style="grid-template-columns:repeat(3,1fr);">
		<div class="ax-card"><p class="ax-card-label">Total Revenue</p><p class="ax-card-value">$<?php echo number_format( $totals['revenue'] ?? 0, 2 ); ?></p></div>
		<div class="ax-card"><p class="ax-card-label">Units Sold</p><p class="ax-card-value"><?php echo number_format( $totals['units'] ?? 0 ); ?></p></div>
		<div class="ax-card"><p class="ax-card-label">Orders</p><p class="ax-card-value"><?php echo number_format( $totals['orders'] ?? 0 ); ?></p></div>
	</div>

	<div class="ax-table-wrap">
		<table class="ax-table">
			<thead><tr><th>Product</th><th>Revenue</th><th>Units</th><th>Orders</th><th>AOV</th></tr></thead>
			<tbody>
				<?php if ( empty( $products ) ) : ?>
					<tr><td colspan="5" class="ax-empty">No product data yet. Product analytics appear once orders are tracked.</td></tr>
				<?php else : ?>
					<?php foreach ( $products as $p ) : ?>
						<tr>
							<td>
								<strong><?php echo esc_html( $p['title'] ?? '—' ); ?></strong>
								<br><span style="font-size:11px;color:#9ca3af;">ID: <?php echo esc_html( $p['productId'] ?? '' ); ?></span>
							</td>
							<td style="font-weight:600;">$<?php echo number_format( $p['revenue'] ?? 0, 2 ); ?></td>
							<td><?php echo number_format( $p['units'] ?? 0 ); ?></td>
							<td><?php echo number_format( $p['orders'] ?? 0 ); ?></td>
							<td>$<?php echo number_format( $p['aov'] ?? 0, 2 ); ?></td>
						</tr>
					<?php endforeach; ?>
				<?php endif; ?>
			</tbody>
		</table>
	</div>
</div>
