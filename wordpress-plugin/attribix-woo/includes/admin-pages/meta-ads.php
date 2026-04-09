<?php
/**
 * Admin Page: Meta Ads — Campaign + ad performance from Meta.
 */
if ( ! defined( 'ABSPATH' ) ) exit;

use Attribix_Woo\Api;
use Attribix_Woo\Settings;

$settings = Settings::get();
$days     = isset( $_GET['days'] ) ? (int) $_GET['days'] : 30;
$data     = Api::get( '/api/standalone/meta-ads', array( 'days' => $days ) );

$campaigns = $data['campaigns'] ?? array();
$ads       = $data['ads'] ?? array();
$totals    = $data['totals'] ?? array();
$connected = $data['connected'] ?? false;
$best      = $data['bestCampaign'] ?? null;
$worst     = $data['worstCampaign'] ?? null;
$view      = isset( $_GET['view'] ) ? sanitize_key( $_GET['view'] ) : 'campaigns';
$base      = admin_url( 'admin.php?page=attribix-meta-ads' );
?>
<div class="wrap ax-wrap">
	<div class="ax-row">
		<h1 style="display:flex;align-items:center;gap:10px;margin:0;">
			<span style="font-size:24px;">📘</span> Meta Ads
		</h1>
		<div class="ax-spacer"></div>
		<?php foreach ( array( 7, 14, 30, 90 ) as $d ) : ?>
			<a href="<?php echo esc_url( $base . '&days=' . $d . '&view=' . $view ); ?>" class="ax-btn <?php echo $days === $d ? 'ax-btn-primary' : ''; ?>"><?php echo $d; ?>d</a>
		<?php endforeach; ?>
	</div>

	<?php
	// Route through attribix.app (Vercel proxy) to avoid Chrome lookalike warnings
	$meta_oauth_url = 'https://attribix.app/api/meta/oauth/start?shop=' . urlencode( Api::shop_domain() ) . '&platform=woocommerce';
	$meta_accounts_url = admin_url( 'admin.php?page=attribix-meta-ads&action=load_accounts' );
	$load_accounts = isset( $_GET['action'] ) && $_GET['action'] === 'load_accounts';

	// Handle ad account selection
	if ( isset( $_POST['meta_action'] ) && wp_verify_nonce( $_POST['_wpnonce'] ?? '', 'attribix_meta_action' ) ) {
		if ( $_POST['meta_action'] === 'select_account' ) {
			$acct_id = sanitize_text_field( $_POST['ad_account_id'] ?? '' );
			if ( $acct_id ) {
				Api::post( '/api/meta/adaccount/select', array( 'adAccountId' => $acct_id, 'shop' => Api::shop_domain() ) );
				echo '<div class="notice notice-success"><p>Ad account saved.</p></div>';
			}
		}
		if ( $_POST['meta_action'] === 'sync' ) {
			$sync_days = (int) ( $_POST['sync_days'] ?? 7 );
			Api::post( '/api/meta/sync', array( 'days' => $sync_days, 'shop' => Api::shop_domain() ) );
			echo '<div class="notice notice-success"><p>Sync triggered.</p></div>';
			// Reload data
			$data = Api::get( '/api/standalone/meta-ads', array( 'days' => $days ) );
			$campaigns = $data['campaigns'] ?? array();
			$ads = $data['ads'] ?? array();
			$totals = $data['totals'] ?? array();
		}
	}
	?>

	<?php if ( ! $connected ) : ?>
		<div style="background:#fff;border:1px solid #e5e7eb;border-radius:8px;padding:24px;margin:16px 0;">
			<div style="display:flex;align-items:center;gap:12px;margin-bottom:12px;">
				<span style="font-size:32px;">📘</span>
				<div>
					<h3 style="margin:0;">Connect Meta Ads</h3>
					<p style="margin:4px 0 0;color:#6b7280;font-size:13px;">Link your Facebook/Instagram ad account to see campaign performance.</p>
				</div>
			</div>
			<button type="button" class="ax-btn ax-btn-primary" onclick="window.open('<?php echo esc_js( $meta_oauth_url ); ?>', 'meta_oauth', 'width=600,height=700')">
				Connect Meta Account
			</button>
			<p style="margin-top:8px;font-size:12px;color:#9ca3af;">A popup will open for Facebook authorization. After connecting, refresh this page.</p>
		</div>
	<?php else : ?>
		<?php
		// Load ad accounts if requested
		$accounts = array();
		if ( $load_accounts || isset( $_POST['meta_action'] ) ) {
			$acct_data = Api::get( '/api/meta/adaccounts' );
			$accounts = $acct_data['accounts'] ?? array();
		}
		?>
		<div style="background:#fff;border:1px solid #e5e7eb;border-radius:8px;padding:20px;margin:16px 0;">
			<div style="display:flex;gap:12px;align-items:center;margin-bottom:16px;">
				<span class="ax-badge ax-badge-green" style="font-size:13px;padding:4px 12px;">Connected</span>
				<button type="button" class="ax-btn" onclick="window.open('<?php echo esc_js( $meta_oauth_url ); ?>', 'meta_oauth', 'width=600,height=700')">Reconnect</button>
				<div class="ax-spacer"></div>
				<form method="post" style="display:inline;">
					<?php wp_nonce_field( 'attribix_meta_action' ); ?>
					<input type="hidden" name="meta_action" value="sync" />
					<select name="sync_days" style="padding:6px;font-size:13px;">
						<option value="7">7 days</option><option value="14">14 days</option><option value="30" selected>30 days</option><option value="90">90 days</option>
					</select>
					<button type="submit" class="ax-btn ax-btn-primary">Sync Now</button>
				</form>
			</div>

			<!-- Ad Account Selector -->
			<div style="border-top:1px solid #e5e7eb;padding-top:16px;">
				<h3 style="margin:0 0 8px;font-size:14px;">Ad Account</h3>
				<?php if ( empty( $accounts ) && ! $load_accounts ) : ?>
					<a href="<?php echo esc_url( $meta_accounts_url ); ?>" class="ax-btn">Load Ad Accounts</a>
				<?php elseif ( ! empty( $accounts ) ) : ?>
					<form method="post">
						<?php wp_nonce_field( 'attribix_meta_action' ); ?>
						<input type="hidden" name="meta_action" value="select_account" />
						<div style="display:flex;gap:8px;align-items:center;">
							<select name="ad_account_id" style="flex:1;padding:8px;font-size:13px;border:1px solid #d1d5db;border-radius:6px;">
								<option value="">Select an ad account...</option>
								<?php foreach ( $accounts as $acct ) : ?>
									<option value="<?php echo esc_attr( $acct['id'] ); ?>">
										<?php echo esc_html( ( $acct['name'] ?? $acct['id'] ) . ' (' . $acct['id'] . ')' . ( ! empty( $acct['currency'] ) ? ' — ' . $acct['currency'] : '' ) ); ?>
									</option>
								<?php endforeach; ?>
							</select>
							<button type="submit" class="ax-btn ax-btn-primary">Save</button>
						</div>
						<p style="font-size:12px;color:#6b7280;margin:6px 0 0;"><?php echo count( $accounts ); ?> ad accounts found.</p>
					</form>
				<?php else : ?>
					<p style="color:#9ca3af;font-size:13px;">No ad accounts found. Make sure your Meta app has the required permissions.</p>
				<?php endif; ?>
			</div>

			<!-- Pixel Settings -->
			<?php
			$pixel_data = Api::get( '/api/meta/pixels' );
			$pixels = $pixel_data['pixels'] ?? array();
			$current_pixel = $settings['fb_pixel_id'] ?? '';
			?>
			<?php if ( ! empty( $pixels ) ) : ?>
			<div style="border-top:1px solid #e5e7eb;padding-top:16px;margin-top:16px;">
				<h3 style="margin:0 0 8px;font-size:14px;">Meta Pixel</h3>
				<div style="display:flex;gap:8px;flex-wrap:wrap;">
					<?php foreach ( $pixels as $px ) : ?>
						<div style="border:1px solid <?php echo ( $current_pixel === $px['id'] ) ? '#16a34a' : '#d1d5db'; ?>;border-radius:6px;padding:8px 14px;font-size:13px;<?php echo ( $current_pixel === $px['id'] ) ? 'background:#ecfdf5;' : ''; ?>">
							<strong><?php echo esc_html( $px['name'] ?? $px['id'] ); ?></strong>
							<br><span style="color:#6b7280;font-size:11px;"><?php echo esc_html( $px['id'] ); ?></span>
							<?php if ( $current_pixel === $px['id'] ) : ?>
								<br><span style="color:#16a34a;font-size:11px;font-weight:600;">✓ Active</span>
							<?php endif; ?>
						</div>
					<?php endforeach; ?>
				</div>
				<p style="font-size:12px;color:#6b7280;margin:8px 0 0;">To change pixel, update Meta Pixel ID in <a href="<?php echo esc_url( admin_url( 'admin.php?page=attribix-woo-settings&tab=tracking' ) ); ?>">Tracking Pixels settings</a>.</p>
			</div>
			<?php endif; ?>
		</div>
	<?php endif; ?>

	<!-- KPIs -->
	<div class="ax-cards">
		<div class="ax-card"><p class="ax-card-label">Spend</p><p class="ax-card-value">$<?php echo number_format( $totals['spend'] ?? 0, 2 ); ?></p></div>
		<div class="ax-card"><p class="ax-card-label">Impressions</p><p class="ax-card-value"><?php echo number_format( $totals['impressions'] ?? 0 ); ?></p></div>
		<div class="ax-card"><p class="ax-card-label">Clicks</p><p class="ax-card-value"><?php echo number_format( $totals['clicks'] ?? 0 ); ?></p></div>
		<div class="ax-card"><p class="ax-card-label">CTR</p><p class="ax-card-value"><?php echo number_format( $totals['ctr'] ?? 0, 2 ); ?>%</p></div>
		<div class="ax-card"><p class="ax-card-label">Purchases</p><p class="ax-card-value"><?php echo number_format( $totals['purchases'] ?? 0 ); ?></p></div>
		<div class="ax-card"><p class="ax-card-label">Revenue</p><p class="ax-card-value">$<?php echo number_format( $totals['value'] ?? 0, 2 ); ?></p></div>
		<div class="ax-card">
			<p class="ax-card-label">ROAS</p>
			<p class="ax-card-value" style="color:<?php echo ( $totals['roas'] ?? 0 ) >= 1 ? '#16a34a' : '#dc2626'; ?>">
				<?php echo number_format( $totals['roas'] ?? 0, 2 ); ?>x
			</p>
		</div>
	</div>

	<!-- Best / Worst -->
	<?php if ( $best || $worst ) : ?>
	<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin:16px 0;">
		<?php if ( $best ) : ?>
			<div class="ax-card" style="background:#ecfdf5;border-color:#bbf7d0;">
				<p style="font-size:11px;font-weight:700;text-transform:uppercase;color:#065f46;margin:0 0 4px;">Best Campaign</p>
				<p style="font-weight:700;font-size:16px;margin:0;"><?php echo esc_html( $best['campaignName'] ?? '' ); ?></p>
				<p style="color:#6b7280;font-size:13px;margin:4px 0 0;"><?php echo number_format( $best['roas'] ?? 0, 2 ); ?>x ROAS &middot; $<?php echo number_format( $best['spend'] ?? 0, 2 ); ?> spend</p>
			</div>
		<?php endif; ?>
		<?php if ( $worst ) : ?>
			<div class="ax-card" style="background:#fef2f2;border-color:#fecaca;">
				<p style="font-size:11px;font-weight:700;text-transform:uppercase;color:#991b1b;margin:0 0 4px;">Needs Attention</p>
				<p style="font-weight:700;font-size:16px;margin:0;"><?php echo esc_html( $worst['campaignName'] ?? '' ); ?></p>
				<p style="color:#6b7280;font-size:13px;margin:4px 0 0;"><?php echo number_format( $worst['roas'] ?? 0, 2 ); ?>x ROAS &middot; $<?php echo number_format( $worst['spend'] ?? 0, 2 ); ?> spend</p>
			</div>
		<?php endif; ?>
	</div>
	<?php endif; ?>

	<!-- View Toggle -->
	<div class="ax-row" style="margin-bottom:16px;">
		<a href="<?php echo esc_url( $base . '&days=' . $days . '&view=campaigns' ); ?>" class="ax-btn <?php echo $view === 'campaigns' ? 'ax-btn-primary' : ''; ?>">Campaigns (<?php echo count( $campaigns ); ?>)</a>
		<a href="<?php echo esc_url( $base . '&days=' . $days . '&view=ads' ); ?>" class="ax-btn <?php echo $view === 'ads' ? 'ax-btn-primary' : ''; ?>">Ads (<?php echo count( $ads ); ?>)</a>
	</div>

	<?php if ( $view === 'campaigns' ) : ?>
		<div class="ax-table-wrap">
			<table class="ax-table">
				<thead><tr><th>Campaign</th><th>Spend</th><th>Impr.</th><th>Clicks</th><th>CTR</th><th>Purch.</th><th>Revenue</th><th>ROAS</th></tr></thead>
				<tbody>
					<?php if ( empty( $campaigns ) ) : ?>
						<tr><td colspan="8" class="ax-empty">No campaign data. Connect Meta Ads and sync to see performance.</td></tr>
					<?php else : ?>
						<?php foreach ( $campaigns as $c ) : ?>
							<tr>
								<td><strong><?php echo esc_html( $c['campaignName'] ?? $c['campaignId'] ?? '—' ); ?></strong></td>
								<td>$<?php echo number_format( $c['spend'] ?? 0, 2 ); ?></td>
								<td><?php echo number_format( $c['impressions'] ?? 0 ); ?></td>
								<td><?php echo number_format( $c['clicks'] ?? 0 ); ?></td>
								<td><?php echo number_format( $c['ctr'] ?? 0, 2 ); ?>%</td>
								<td><?php echo (int) ( $c['purchases'] ?? 0 ); ?></td>
								<td>$<?php echo number_format( $c['purchaseValue'] ?? 0, 2 ); ?></td>
								<td style="font-weight:700;color:<?php echo ( $c['roas'] ?? 0 ) >= 1 ? '#16a34a' : '#dc2626'; ?>"><?php echo number_format( $c['roas'] ?? 0, 2 ); ?>x</td>
							</tr>
						<?php endforeach; ?>
					<?php endif; ?>
				</tbody>
			</table>
		</div>
	<?php else : ?>
		<div class="ax-table-wrap">
			<table class="ax-table">
				<thead><tr><th>Ad</th><th>Campaign</th><th>Ad Set</th><th>Spend</th><th>Clicks</th><th>CTR</th><th>Purch.</th><th>Revenue</th><th>ROAS</th></tr></thead>
				<tbody>
					<?php if ( empty( $ads ) ) : ?>
						<tr><td colspan="9" class="ax-empty">No ad data yet.</td></tr>
					<?php else : ?>
						<?php foreach ( $ads as $a ) : ?>
							<tr>
								<td><strong><?php echo esc_html( $a['adName'] ?? $a['adId'] ?? '—' ); ?></strong></td>
								<td style="font-size:12px;color:#6b7280;"><?php echo esc_html( $a['campaignName'] ?? '' ); ?></td>
								<td style="font-size:12px;color:#6b7280;"><?php echo esc_html( $a['adSetName'] ?? '' ); ?></td>
								<td>$<?php echo number_format( $a['spend'] ?? 0, 2 ); ?></td>
								<td><?php echo number_format( $a['clicks'] ?? 0 ); ?></td>
								<td><?php echo number_format( $a['ctr'] ?? 0, 2 ); ?>%</td>
								<td><?php echo (int) ( $a['purchases'] ?? 0 ); ?></td>
								<td>$<?php echo number_format( $a['purchaseValue'] ?? 0, 2 ); ?></td>
								<td style="font-weight:700;color:<?php echo ( $a['roas'] ?? 0 ) >= 1 ? '#16a34a' : '#dc2626'; ?>"><?php echo number_format( $a['roas'] ?? 0, 2 ); ?>x</td>
							</tr>
						<?php endforeach; ?>
					<?php endif; ?>
				</tbody>
			</table>
		</div>
	<?php endif; ?>
</div>
