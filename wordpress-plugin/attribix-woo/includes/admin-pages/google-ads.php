<?php
/**
 * Admin Page: Google Ads — Campaign performance from Google.
 */
if ( ! defined( 'ABSPATH' ) ) exit;

use Attribix_Woo\Api;
use Attribix_Woo\Settings;

$settings = Settings::get();
$days     = isset( $_GET['days'] ) ? (int) $_GET['days'] : 30;
$data     = Api::get( '/api/standalone/google-ads', array( 'days' => $days ) );

$campaigns = $data['campaigns'] ?? array();
$totals    = $data['totals'] ?? array();
$connected = $data['connected'] ?? false;
$base      = admin_url( 'admin.php?page=attribix-google-ads' );
?>
<div class="wrap ax-wrap">
	<div class="ax-row">
		<h1 style="display:flex;align-items:center;gap:10px;margin:0;">
			<span style="font-size:24px;">📈</span> Google Ads
		</h1>
		<div class="ax-spacer"></div>
		<?php foreach ( array( 7, 14, 30, 90 ) as $d ) : ?>
			<a href="<?php echo esc_url( $base . '&days=' . $d ); ?>" class="ax-btn <?php echo $days === $d ? 'ax-btn-primary' : ''; ?>"><?php echo $d; ?>d</a>
		<?php endforeach; ?>
	</div>

	<?php if ( ! $connected ) : ?>
		<div class="notice notice-warning" style="margin:16px 0;">
			<p>Google Ads not connected. Connect via your <a href="<?php echo esc_url( admin_url( 'admin.php?page=attribix-woo-settings&tab=integrations' ) ); ?>">Integrations settings</a>.</p>
		</div>
	<?php endif; ?>

	<div class="ax-cards">
		<div class="ax-card"><p class="ax-card-label">Spend</p><p class="ax-card-value">$<?php echo number_format( $totals['spend'] ?? 0, 2 ); ?></p></div>
		<div class="ax-card"><p class="ax-card-label">Impressions</p><p class="ax-card-value"><?php echo number_format( $totals['impressions'] ?? 0 ); ?></p></div>
		<div class="ax-card"><p class="ax-card-label">Clicks</p><p class="ax-card-value"><?php echo number_format( $totals['clicks'] ?? 0 ); ?></p></div>
		<div class="ax-card"><p class="ax-card-label">Conversions</p><p class="ax-card-value"><?php echo number_format( $totals['conversions'] ?? 0 ); ?></p></div>
		<div class="ax-card">
			<p class="ax-card-label">ROAS</p>
			<p class="ax-card-value" style="color:<?php echo ( $totals['roas'] ?? 0 ) >= 1 ? '#16a34a' : '#dc2626'; ?>">
				<?php echo number_format( $totals['roas'] ?? 0, 2 ); ?>x
			</p>
		</div>
	</div>

	<div class="ax-table-wrap">
		<table class="ax-table">
			<thead><tr><th>Campaign</th><th>Spend</th><th>Impressions</th><th>Clicks</th><th>Conv.</th><th>Conv. Value</th><th>ROAS</th></tr></thead>
			<tbody>
				<?php if ( empty( $campaigns ) ) : ?>
					<tr><td colspan="7" class="ax-empty">No Google Ads data. Connect Google Ads and sync to see performance.</td></tr>
				<?php else : ?>
					<?php foreach ( $campaigns as $c ) : ?>
						<tr>
							<td><strong><?php echo esc_html( $c['campaignName'] ?? $c['campaignId'] ?? '—' ); ?></strong></td>
							<td>$<?php echo number_format( $c['spend'] ?? 0, 2 ); ?></td>
							<td><?php echo number_format( $c['impressions'] ?? 0 ); ?></td>
							<td><?php echo number_format( $c['clicks'] ?? 0 ); ?></td>
							<td><?php echo (int) ( $c['conversions'] ?? 0 ); ?></td>
							<td>$<?php echo number_format( $c['conversionValue'] ?? 0, 2 ); ?></td>
							<td style="font-weight:700;color:<?php echo ( $c['roas'] ?? 0 ) >= 1 ? '#16a34a' : '#dc2626'; ?>"><?php echo number_format( $c['roas'] ?? 0, 2 ); ?>x</td>
						</tr>
					<?php endforeach; ?>
				<?php endif; ?>
			</tbody>
		</table>
	</div>
</div>
