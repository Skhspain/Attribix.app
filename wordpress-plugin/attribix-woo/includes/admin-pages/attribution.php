<?php
/**
 * Admin Page: Attribution — Multi-touch attribution models.
 */
if ( ! defined( 'ABSPATH' ) ) exit;

use Attribix_Woo\Api;
use Attribix_Woo\Settings;

$settings = Settings::get();
$days     = isset( $_GET['days'] ) ? (int) $_GET['days'] : 30;
$data     = Api::get( '/api/standalone/attribution', array( 'days' => $days ) );

$channels     = $data['channels'] ?? array();
$journeys     = $data['journeys'] ?? array();
$avgSteps     = $data['avgTouchpoints'] ?? 0;
$totalRevenue = $data['totalRevenue'] ?? 0;
$models       = array( 'lastTouch' => 'Last Touch', 'firstTouch' => 'First Touch', 'linear' => 'Linear', 'timeDecay' => 'Time Decay' );
$model        = isset( $_GET['model'] ) ? sanitize_key( $_GET['model'] ) : 'lastTouch';
$base         = admin_url( 'admin.php?page=attribix-attribution' );
?>
<div class="wrap ax-wrap">
	<div class="ax-row">
		<h1 style="display:flex;align-items:center;gap:10px;margin:0;">
			<span style="font-size:24px;">🎯</span> Attribution
		</h1>
		<div class="ax-spacer"></div>
		<?php foreach ( array( 7, 14, 30, 90 ) as $d ) : ?>
			<a href="<?php echo esc_url( $base . '&days=' . $d . '&model=' . $model ); ?>" class="ax-btn <?php echo $days === $d ? 'ax-btn-primary' : ''; ?>"><?php echo $d; ?>d</a>
		<?php endforeach; ?>
	</div>

	<div class="ax-cards" style="grid-template-columns:repeat(3,1fr);">
		<div class="ax-card"><p class="ax-card-label">Total Revenue</p><p class="ax-card-value">$<?php echo number_format( $totalRevenue, 2 ); ?></p></div>
		<div class="ax-card"><p class="ax-card-label">Avg Touchpoints</p><p class="ax-card-value"><?php echo number_format( $avgSteps, 1 ); ?></p></div>
		<div class="ax-card"><p class="ax-card-label">Channels</p><p class="ax-card-value"><?php echo count( $channels ); ?></p></div>
	</div>

	<!-- Model Selector -->
	<div class="ax-row" style="margin-bottom:16px;">
		<span style="font-size:13px;color:#6b7280;font-weight:500;">Attribution Model:</span>
		<?php foreach ( $models as $key => $label ) : ?>
			<a href="<?php echo esc_url( $base . '&days=' . $days . '&model=' . $key ); ?>" class="ax-btn <?php echo $model === $key ? 'ax-btn-primary' : ''; ?>"><?php echo esc_html( $label ); ?></a>
		<?php endforeach; ?>
	</div>

	<!-- Channel Attribution Table -->
	<div class="ax-table-wrap">
		<table class="ax-table">
			<thead><tr><th>Channel</th><th>Revenue</th><th>% of Total</th><th>Orders</th><th>Visitors</th></tr></thead>
			<tbody>
				<?php if ( empty( $channels ) ) : ?>
					<tr><td colspan="5" class="ax-empty">No attribution data yet. Needs tracked orders with touchpoint data.</td></tr>
				<?php else : ?>
					<?php foreach ( $channels as $ch ) :
						$rev = $ch[$model] ?? $ch['revenue'] ?? $ch['lastTouch'] ?? 0;
						$pct = $totalRevenue > 0 ? round( ( $rev / $totalRevenue ) * 100, 1 ) : 0;
					?>
						<tr>
							<td>
								<strong><?php echo esc_html( $ch['channel'] ?? $ch['name'] ?? '—' ); ?></strong>
							</td>
							<td>$<?php echo number_format( $rev, 2 ); ?></td>
							<td>
								<div style="display:flex;align-items:center;gap:8px;">
									<div style="flex:1;max-width:120px;height:8px;background:#f3f4f6;border-radius:4px;overflow:hidden;">
										<div style="width:<?php echo min( $pct, 100 ); ?>%;height:100%;background:#6366f1;border-radius:4px;"></div>
									</div>
									<span style="font-size:12px;color:#6b7280;"><?php echo $pct; ?>%</span>
								</div>
							</td>
							<td><?php echo (int) ( $ch['orders'] ?? 0 ); ?></td>
							<td><?php echo (int) ( $ch['visitors'] ?? 0 ); ?></td>
						</tr>
					<?php endforeach; ?>
				<?php endif; ?>
			</tbody>
		</table>
	</div>

	<?php if ( ! empty( $journeys ) ) : ?>
	<div class="ax-section">
		<h2 class="ax-section-title">Recent Customer Journeys</h2>
		<div class="ax-table-wrap">
			<table class="ax-table">
				<thead><tr><th>Order</th><th>Revenue</th><th>Touchpoints</th><th>Journey</th></tr></thead>
				<tbody>
					<?php foreach ( array_slice( $journeys, 0, 15 ) as $j ) : ?>
						<tr>
							<td>#<?php echo esc_html( $j['orderId'] ?? '—' ); ?></td>
							<td>$<?php echo number_format( $j['revenue'] ?? 0, 2 ); ?></td>
							<td><?php echo (int) ( $j['steps'] ?? $j['touchpoints'] ?? 0 ); ?></td>
							<td style="font-size:12px;color:#6b7280;">
								<?php echo esc_html( implode( ' → ', $j['channels'] ?? $j['path'] ?? array() ) ); ?>
							</td>
						</tr>
					<?php endforeach; ?>
				</tbody>
			</table>
		</div>
	</div>
	<?php endif; ?>
</div>
