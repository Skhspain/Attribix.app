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

	<?php
	// Route through attribix.app (Vercel proxy) to avoid Chrome lookalike warnings
	$google_oauth_url = 'https://attribix-app.fly.dev/api/google/oauth/start?shop=' . urlencode( Api::shop_domain() ) . '&platform=woocommerce';

	// Handle sync
	if ( isset( $_POST['google_action'] ) && wp_verify_nonce( $_POST['_wpnonce'] ?? '', 'attribix_google_action' ) ) {
		if ( $_POST['google_action'] === 'sync' ) {
			$sync_days = (int) ( $_POST['sync_days'] ?? 7 );
			Api::post( '/api/google/sync-spend', array( 'days' => $sync_days, 'shop' => Api::shop_domain() ) );
			echo '<div class="notice notice-success"><p>Sync triggered.</p></div>';
			$data = Api::get( '/api/standalone/google-ads', array( 'days' => $days ) );
			$campaigns = $data['campaigns'] ?? array();
			$totals = $data['totals'] ?? array();
		}
	}
	?>

	<?php if ( ! $connected ) : ?>
		<div style="background:#fff;border:1px solid #e5e7eb;border-radius:8px;padding:24px;margin:16px 0;">
			<div style="display:flex;align-items:center;gap:12px;margin-bottom:12px;">
				<span style="font-size:32px;">📈</span>
				<div>
					<h3 style="margin:0;">Connect Google Ads</h3>
					<p style="margin:4px 0 0;color:#6b7280;font-size:13px;">Link your Google Ads account to see campaign performance and spend data.</p>
				</div>
			</div>
			<button type="button" class="ax-btn ax-btn-primary" onclick="window.open('<?php echo esc_js( $google_oauth_url ); ?>', 'google_oauth', 'width=900,height=800')">
				Connect Google Ads
			</button>
			<p style="margin-top:8px;font-size:12px;color:#9ca3af;">A popup will open for Google authorization. After connecting, refresh this page.</p>
		</div>
	<?php else : ?>
		<div style="display:flex;gap:12px;margin:16px 0;align-items:center;">
			<span class="ax-badge ax-badge-green" style="font-size:13px;padding:4px 12px;">Connected</span>
			<button type="button" class="ax-btn" onclick="window.open('<?php echo esc_js( $google_oauth_url ); ?>', 'google_oauth', 'width=900,height=800')">
				Reconnect
			</button>
			<form method="post" style="display:inline;">
				<?php wp_nonce_field( 'attribix_google_action' ); ?>
				<input type="hidden" name="google_action" value="sync" />
				<select name="sync_days" style="padding:6px;font-size:13px;">
					<option value="7">7 days</option><option value="14">14 days</option><option value="30" selected>30 days</option><option value="90">90 days</option>
				</select>
				<button type="submit" class="ax-btn">Sync Now</button>
			</form>
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
