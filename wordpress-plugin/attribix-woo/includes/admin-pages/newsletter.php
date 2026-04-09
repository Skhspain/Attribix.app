<?php
/**
 * Admin Page: Newsletter — Subscribers, campaigns, send stats.
 */
if ( ! defined( 'ABSPATH' ) ) exit;

use Attribix_Woo\Api;
use Attribix_Woo\Settings;

$settings = Settings::get();
$shop     = Api::shop_domain();
$data     = Api::get( '/api/standalone/newsletter', array( 'shop' => $shop, 'accountId' => $settings['account_id'] ) );

$subscribers = $data['subscribers'] ?? array();
$campaigns   = $data['campaigns'] ?? array();
$stats       = $data['stats'] ?? array();

$tab = isset( $_GET['subtab'] ) ? sanitize_key( $_GET['subtab'] ) : 'subscribers';
$base_url = admin_url( 'admin.php?page=attribix-newsletter' );
?>
<div class="wrap ax-wrap">
	<h1 style="display:flex;align-items:center;gap:10px;">
		<span style="font-size:24px;">📧</span> Newsletter
	</h1>

	<!-- KPI Cards -->
	<div class="ax-cards" style="grid-template-columns:repeat(4,1fr);">
		<div class="ax-card">
			<p class="ax-card-label">Subscribers</p>
			<p class="ax-card-value"><?php echo count( array_filter( $subscribers, function( $s ) { return ( $s['status'] ?? '' ) === 'subscribed'; } ) ); ?></p>
		</div>
		<div class="ax-card">
			<p class="ax-card-label">Newsletters Sent</p>
			<p class="ax-card-value"><?php echo count( array_filter( $campaigns, function( $c ) { return ( $c['status'] ?? '' ) === 'sent'; } ) ); ?></p>
		</div>
		<div class="ax-card">
			<p class="ax-card-label">Avg Open Rate</p>
			<p class="ax-card-value"><?php
				$sent_campaigns = array_filter( $campaigns, function( $c ) { return ( $c['status'] ?? '' ) === 'sent' && ( $c['recipientCount'] ?? 0 ) > 0; } );
				$avg_open = 0;
				if ( count( $sent_campaigns ) > 0 ) {
					$total_open = array_sum( array_map( function( $c ) { return ( $c['openCount'] ?? 0 ) / max( $c['recipientCount'], 1 ) * 100; }, $sent_campaigns ) );
					$avg_open = $total_open / count( $sent_campaigns );
				}
				echo number_format( $avg_open, 1 ) . '%';
			?></p>
		</div>
		<div class="ax-card">
			<p class="ax-card-label">Total Unsubscribed</p>
			<p class="ax-card-value"><?php echo count( array_filter( $subscribers, function( $s ) { return ( $s['status'] ?? '' ) === 'unsubscribed'; } ) ); ?></p>
		</div>
	</div>

	<!-- Tabs -->
	<div class="ax-tabs">
		<a href="<?php echo esc_url( $base_url . '&subtab=subscribers' ); ?>" class="ax-tab <?php echo $tab === 'subscribers' ? 'ax-tab-active' : ''; ?>">Subscribers</a>
		<a href="<?php echo esc_url( $base_url . '&subtab=newsletters' ); ?>" class="ax-tab <?php echo $tab === 'newsletters' ? 'ax-tab-active' : ''; ?>">Newsletters</a>
	</div>

	<?php if ( $tab === 'subscribers' ) : ?>
		<div class="ax-table-wrap">
			<table class="ax-table">
				<thead>
					<tr><th>Email</th><th>Source</th><th>Status</th><th>Subscribed</th></tr>
				</thead>
				<tbody>
					<?php if ( empty( $subscribers ) ) : ?>
						<tr><td colspan="4" class="ax-empty">No subscribers yet. Use the <code>[attribix_newsletter]</code> shortcode to collect emails.</td></tr>
					<?php else : ?>
						<?php foreach ( array_slice( $subscribers, 0, 100 ) as $s ) : ?>
							<tr>
								<td><strong><?php echo esc_html( $s['email'] ?? '' ); ?></strong></td>
								<td style="color:#6b7280;font-size:12px;"><?php echo esc_html( $s['source'] ?? '—' ); ?></td>
								<td>
									<span class="ax-badge <?php echo ( $s['status'] ?? '' ) === 'subscribed' ? 'ax-badge-green' : 'ax-badge-gray'; ?>">
										<?php echo esc_html( $s['status'] ?? 'unknown' ); ?>
									</span>
								</td>
								<td style="color:#9ca3af;"><?php echo esc_html( isset( $s['createdAt'] ) ? date( 'M j, Y', strtotime( $s['createdAt'] ) ) : '—' ); ?></td>
							</tr>
						<?php endforeach; ?>
					<?php endif; ?>
				</tbody>
			</table>
		</div>

	<?php else : ?>
		<div class="ax-table-wrap">
			<table class="ax-table">
				<thead>
					<tr><th>Newsletter</th><th>Subject</th><th>Status</th><th>Recipients</th><th>Open Rate</th><th>Click Rate</th><th>Sent</th></tr>
				</thead>
				<tbody>
					<?php if ( empty( $campaigns ) ) : ?>
						<tr><td colspan="7" class="ax-empty">No newsletters yet.</td></tr>
					<?php else : ?>
						<?php foreach ( $campaigns as $c ) : ?>
							<tr>
								<td><strong><?php echo esc_html( $c['name'] ?? 'Untitled' ); ?></strong></td>
								<td style="color:#6b7280;font-size:12px;"><?php echo esc_html( $c['subject'] ?? '—' ); ?></td>
								<td>
									<?php
									$st = $c['status'] ?? 'draft';
									$tone = $st === 'sent' ? 'green' : ( $st === 'draft' ? 'gray' : 'yellow' );
									?>
									<span class="ax-badge ax-badge-<?php echo $tone; ?>"><?php echo esc_html( $st ); ?></span>
								</td>
								<td><?php echo (int) ( $c['recipientCount'] ?? 0 ); ?></td>
								<td><?php echo ( $c['recipientCount'] ?? 0 ) > 0 ? round( ( $c['openCount'] ?? 0 ) / max( $c['recipientCount'], 1 ) * 100 ) . '%' : '—'; ?></td>
								<td><?php echo ( $c['recipientCount'] ?? 0 ) > 0 ? round( ( $c['clickCount'] ?? 0 ) / max( $c['recipientCount'], 1 ) * 100 ) . '%' : '—'; ?></td>
								<td style="color:#9ca3af;"><?php echo esc_html( isset( $c['sentAt'] ) ? date( 'M j', strtotime( $c['sentAt'] ) ) : '—' ); ?></td>
							</tr>
						<?php endforeach; ?>
					<?php endif; ?>
				</tbody>
			</table>
		</div>
	<?php endif; ?>

	<p style="margin-top:16px;color:#6b7280;">
		Create and send newsletters from your <a href="https://attribix.app/analytics/newsletter" target="_blank">Attribix Dashboard</a>.
		Use <code>[attribix_newsletter]</code> shortcode to add signup forms to your site.
	</p>
</div>
