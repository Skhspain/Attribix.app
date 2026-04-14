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
$message     = '';

$tab = isset( $_GET['subtab'] ) ? sanitize_key( $_GET['subtab'] ) : 'subscribers';
$base_url = admin_url( 'admin.php?page=attribix-newsletter' );

// Handle add subscriber
if ( isset( $_POST['add_subscriber'] ) && wp_verify_nonce( $_POST['_sub_nonce'] ?? '', 'attribix_subscriber' ) ) {
	$email = sanitize_email( $_POST['sub_email'] ?? '' );
	if ( is_email( $email ) ) {
		$result = Api::post( '/api/standalone/newsletter/update', array(
			'action' => 'create-subscriber',
			'email'  => $email,
			'source' => 'manual',
			'shop'   => $shop,
		) );
		if ( ! empty( $result['ok'] ) ) {
			$message = 'Subscriber added: ' . esc_html( $email );
			// Reload data
			$data = Api::get( '/api/standalone/newsletter', array( 'shop' => $shop, 'accountId' => $settings['account_id'] ) );
			$subscribers = $data['subscribers'] ?? array();
		} else {
			$message = 'Failed: ' . esc_html( $result['error'] ?? 'Unknown error' );
		}
	} else {
		$message = 'Invalid email address.';
	}
}

// Handle CSV import
if ( isset( $_POST['import_csv'] ) && wp_verify_nonce( $_POST['_sub_nonce'] ?? '', 'attribix_subscriber' ) && ! empty( $_FILES['csv_file']['tmp_name'] ) ) {
	$file = $_FILES['csv_file']['tmp_name'];
	$handle = fopen( $file, 'r' );
	$imported = 0;
	$skipped = 0;
	$header = fgetcsv( $handle ); // skip header row

	while ( ( $row = fgetcsv( $handle ) ) !== false ) {
		$email = isset( $row[0] ) ? sanitize_email( trim( $row[0] ) ) : '';
		if ( ! is_email( $email ) ) { $skipped++; continue; }
		$result = Api::post( '/api/standalone/newsletter/update', array(
			'action' => 'create-subscriber',
			'email'  => $email,
			'source' => 'csv_import',
			'shop'   => $shop,
		) );
		if ( ! empty( $result['ok'] ) ) { $imported++; } else { $skipped++; }
	}
	fclose( $handle );
	$message = "Imported {$imported} subscribers. Skipped {$skipped}.";
	// Reload data
	$data = Api::get( '/api/standalone/newsletter', array( 'shop' => $shop, 'accountId' => $settings['account_id'] ) );
	$subscribers = $data['subscribers'] ?? array();
}

// Handle unsubscribe
if ( isset( $_POST['unsubscribe'] ) && wp_verify_nonce( $_POST['_sub_nonce'] ?? '', 'attribix_subscriber' ) ) {
	$sub_id = sanitize_text_field( $_POST['sub_id'] ?? '' );
	if ( $sub_id ) {
		Api::post( '/api/standalone/newsletter/update', array( 'action' => 'unsubscribe', 'id' => $sub_id, 'shop' => $shop ) );
		$message = 'Subscriber unsubscribed.';
		$data = Api::get( '/api/standalone/newsletter', array( 'shop' => $shop, 'accountId' => $settings['account_id'] ) );
		$subscribers = $data['subscribers'] ?? array();
	}
}

$show_add = isset( $_GET['add'] );
$show_import = isset( $_GET['import'] );
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

	<!-- Action Buttons -->
	<div style="display:flex;gap:12px;margin:20px 0;">
		<a href="<?php echo esc_url( admin_url( 'admin.php?page=attribix-newsletter-templates' ) ); ?>" style="display:inline-flex;align-items:center;gap:8px;padding:12px 24px;background:#16a34a;color:#fff;border-radius:8px;font-size:15px;font-weight:600;text-decoration:none;transition:background 0.15s;" onmouseenter="this.style.background='#15803d'" onmouseleave="this.style.background='#16a34a'">
			<span style="font-size:18px;">+</span> New Newsletter
		</a>
		<a href="<?php echo esc_url( admin_url( 'admin.php?page=attribix-flows' ) ); ?>" style="display:inline-flex;align-items:center;gap:8px;padding:12px 24px;background:#111827;color:#fff;border-radius:8px;font-size:15px;font-weight:600;text-decoration:none;transition:background 0.15s;" onmouseenter="this.style.background='#374151'" onmouseleave="this.style.background='#111827'">
			⚡ Automation Flows
		</a>
	</div>

	<!-- Tabs -->
	<div class="ax-tabs">
		<a href="<?php echo esc_url( $base_url . '&subtab=subscribers' ); ?>" class="ax-tab <?php echo $tab === 'subscribers' ? 'ax-tab-active' : ''; ?>">Subscribers</a>
		<a href="<?php echo esc_url( $base_url . '&subtab=newsletters' ); ?>" class="ax-tab <?php echo $tab === 'newsletters' ? 'ax-tab-active' : ''; ?>">Newsletters</a>
	</div>

	<?php if ( $message ) : ?>
		<div class="notice notice-info" style="margin:12px 0;"><p><?php echo esc_html( $message ); ?></p></div>
	<?php endif; ?>

	<?php if ( $tab === 'subscribers' ) : ?>

		<!-- Action buttons -->
		<div class="ax-row" style="margin-bottom:16px;">
			<a href="<?php echo esc_url( $base_url . '&subtab=subscribers&add=1' ); ?>" class="ax-btn ax-btn-primary">+ Add Subscriber</a>
			<a href="<?php echo esc_url( $base_url . '&subtab=subscribers&import=1' ); ?>" class="ax-btn">Import CSV</a>
			<div class="ax-spacer"></div>
			<span style="color:#6b7280;font-size:13px;"><?php echo count( $subscribers ); ?> total subscribers</span>
		</div>

		<!-- Add Subscriber Form -->
		<?php if ( $show_add ) : ?>
			<div style="background:#fff;border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin-bottom:16px;">
				<h3 style="margin:0 0 12px;">Add Subscriber</h3>
				<form method="post">
					<?php wp_nonce_field( 'attribix_subscriber', '_sub_nonce' ); ?>
					<div style="display:flex;gap:8px;">
						<input type="email" name="sub_email" placeholder="email@example.com" required style="flex:1;padding:8px 12px;border:1px solid #d1d5db;border-radius:6px;font-size:13px;" />
						<button type="submit" name="add_subscriber" value="1" class="ax-btn ax-btn-primary">Add</button>
						<a href="<?php echo esc_url( $base_url . '&subtab=subscribers' ); ?>" class="ax-btn">Cancel</a>
					</div>
				</form>
			</div>
		<?php endif; ?>

		<!-- CSV Import Form -->
		<?php if ( $show_import ) : ?>
			<div style="background:#fff;border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin-bottom:16px;">
				<h3 style="margin:0 0 8px;">Import Subscribers from CSV</h3>
				<p style="font-size:13px;color:#6b7280;margin:0 0 12px;">Upload a CSV file with email addresses in the first column. The first row (header) will be skipped.</p>
				<form method="post" enctype="multipart/form-data">
					<?php wp_nonce_field( 'attribix_subscriber', '_sub_nonce' ); ?>
					<div style="display:flex;gap:8px;align-items:center;">
						<input type="file" name="csv_file" accept=".csv,.txt" required style="font-size:13px;" />
						<button type="submit" name="import_csv" value="1" class="ax-btn ax-btn-primary">Import</button>
						<a href="<?php echo esc_url( $base_url . '&subtab=subscribers' ); ?>" class="ax-btn">Cancel</a>
					</div>
				</form>
				<div style="margin-top:12px;padding:10px;background:#f9fafb;border-radius:6px;font-size:12px;color:#6b7280;">
					<strong>CSV format example:</strong><br>
					<code>email<br>john@example.com<br>jane@example.com<br>customer@store.com</code>
				</div>
			</div>
		<?php endif; ?>

		<div class="ax-table-wrap">
			<table class="ax-table">
				<thead>
					<tr><th>Email</th><th>Source</th><th>Status</th><th>Subscribed</th><th>Actions</th></tr>
				</thead>
				<tbody>
					<?php if ( empty( $subscribers ) ) : ?>
						<tr><td colspan="5" class="ax-empty">No subscribers yet. Add your first subscriber above.</td></tr>
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
								<td>
									<?php if ( ( $s['status'] ?? '' ) === 'subscribed' && ! empty( $s['id'] ) ) : ?>
										<form method="post" style="display:inline;">
											<?php wp_nonce_field( 'attribix_subscriber', '_sub_nonce' ); ?>
											<input type="hidden" name="sub_id" value="<?php echo esc_attr( $s['id'] ); ?>" />
											<button type="submit" name="unsubscribe" value="1" class="ax-btn" style="padding:3px 10px;font-size:11px;color:#dc2626;" onclick="return confirm('Unsubscribe this email?')">Unsubscribe</button>
										</form>
									<?php endif; ?>
								</td>
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

	<!-- Advanced / Help -->
	<details style="margin-top:20px;">
		<summary style="cursor:pointer;color:#6b7280;font-size:13px;">Advanced options & help</summary>
		<div style="padding:14px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;margin-top:8px;font-size:13px;color:#374151;">
			<p style="margin:0 0 8px;"><strong>Signup form shortcode:</strong> <code>[attribix_newsletter]</code> — place on any page to collect emails.</p>
			<p style="margin:0 0 8px;"><strong>Optional attributes:</strong> <code>title="..."</code> <code>button_text="..."</code> <code>placeholder="..."</code> <code>style="minimal"</code></p>
			<p style="margin:0;"><strong>Webhook:</strong> You can also receive subscribers from Google Forms or other tools via your <a href="<?php echo esc_url( admin_url( 'admin.php?page=attribix-woo-settings&tab=newsletter' ) ); ?>">newsletter settings</a>.</p>
		</div>
	</details>
</div>
