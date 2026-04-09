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

	<?php if ( ! $connected ) : ?>
		<div class="notice notice-warning" style="margin:16px 0;">
			<p>Meta Ads not connected. Connect via your <a href="<?php echo esc_url( admin_url( 'admin.php?page=attribix-woo-settings&tab=integrations' ) ); ?>">Integrations settings</a>.</p>
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
