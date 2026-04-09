<?php
/**
 * Admin Page: Lead Center — Full CRUD for leads.
 */
if ( ! defined( 'ABSPATH' ) ) exit;

use Attribix_Woo\Api;
use Attribix_Woo\Settings;

$settings = Settings::get();
$shop     = Api::shop_domain();
$message  = '';

// Handle actions
if ( isset( $_POST['lead_action'] ) && wp_verify_nonce( $_POST['_wpnonce'] ?? '', 'attribix_lead_action' ) ) {
	$action = sanitize_key( $_POST['lead_action'] );

	if ( $action === 'create' ) {
		$result = Api::post( '/api/standalone/leads/update', array(
			'action'    => 'create',
			'email'     => sanitize_email( $_POST['email'] ?? '' ),
			'firstName' => sanitize_text_field( $_POST['firstName'] ?? '' ),
			'lastName'  => sanitize_text_field( $_POST['lastName'] ?? '' ),
			'phone'     => sanitize_text_field( $_POST['phone'] ?? '' ),
			'company'   => sanitize_text_field( $_POST['company'] ?? '' ),
			'source'    => 'manual',
			'shop'      => $shop,
		) );
		$message = ( $result['ok'] ?? false ) ? 'Lead created.' : ( $result['error'] ?? 'Failed to create lead.' );
	}

	if ( $action === 'update_status' ) {
		$result = Api::post( '/api/standalone/leads/update', array(
			'action' => 'update',
			'id'     => sanitize_text_field( $_POST['lead_id'] ?? '' ),
			'status' => sanitize_key( $_POST['status'] ?? '' ),
			'shop'   => $shop,
		) );
		$message = ( $result['ok'] ?? false ) ? 'Status updated.' : ( $result['error'] ?? 'Failed.' );
	}

	if ( $action === 'add_note' ) {
		$result = Api::post( '/api/standalone/leads/update', array(
			'action' => 'update',
			'id'     => sanitize_text_field( $_POST['lead_id'] ?? '' ),
			'notes'  => sanitize_textarea_field( $_POST['notes'] ?? '' ),
			'shop'   => $shop,
		) );
		$message = ( $result['ok'] ?? false ) ? 'Note saved.' : ( $result['error'] ?? 'Failed.' );
	}
}

$data   = Api::get( '/api/standalone/leads', array( 'shop' => $shop, 'accountId' => $settings['account_id'] ) );
$leads  = $data['leads'] ?? array();
$stats  = $data['stats'] ?? array();
$filter = isset( $_GET['status'] ) ? sanitize_key( $_GET['status'] ) : 'all';
if ( $filter !== 'all' ) {
	$leads = array_filter( $leads, function( $l ) use ( $filter ) { return ( $l['status'] ?? '' ) === $filter; } );
}

$show_add = isset( $_GET['add'] );
$source_labels = array( 'newsletter_signup' => 'Newsletter', 'contact_form' => 'Contact Form', 'meta_ad' => 'Meta Ad', 'google_ad' => 'Google Ad', 'google_form' => 'Google Form', 'manual' => 'Manual', 'import' => 'Import' );
$status_colors = array( 'new' => 'blue', 'contacted' => 'yellow', 'qualified' => 'yellow', 'converted' => 'green', 'lost' => 'red' );
$base = admin_url( 'admin.php?page=attribix-leads' );
?>
<div class="wrap ax-wrap">
	<div class="ax-row">
		<h1 style="display:flex;align-items:center;gap:10px;margin:0;">
			<span style="font-size:24px;">👥</span> Lead Center
		</h1>
		<div class="ax-spacer"></div>
		<a href="<?php echo esc_url( $base . '&add=1' ); ?>" class="ax-btn ax-btn-primary">+ Add Lead</a>
	</div>

	<?php if ( $message ) : ?>
		<div class="notice notice-success" style="margin:12px 0;"><p><?php echo esc_html( $message ); ?></p></div>
	<?php endif; ?>

	<div class="ax-cards" style="grid-template-columns:repeat(5,1fr);">
		<div class="ax-card"><p class="ax-card-label">Total</p><p class="ax-card-value"><?php echo count( $data['leads'] ?? array() ); ?></p></div>
		<div class="ax-card"><p class="ax-card-label">New</p><p class="ax-card-value" style="color:#3b82f6;"><?php echo (int) ( $stats['new'] ?? 0 ); ?></p></div>
		<div class="ax-card"><p class="ax-card-label">Contacted</p><p class="ax-card-value" style="color:#f59e0b;"><?php echo (int) ( $stats['contacted'] ?? 0 ); ?></p></div>
		<div class="ax-card"><p class="ax-card-label">Qualified</p><p class="ax-card-value" style="color:#f59e0b;"><?php echo (int) ( $stats['qualified'] ?? 0 ); ?></p></div>
		<div class="ax-card"><p class="ax-card-label">Converted</p><p class="ax-card-value" style="color:#16a34a;"><?php echo (int) ( $stats['converted'] ?? 0 ); ?></p></div>
	</div>

	<!-- Add Lead Form -->
	<?php if ( $show_add ) : ?>
		<div style="background:#fff;border:1px solid #e5e7eb;border-radius:8px;padding:20px;margin:16px 0;">
			<h3 style="margin:0 0 16px;">Add New Lead</h3>
			<form method="post">
				<?php wp_nonce_field( 'attribix_lead_action' ); ?>
				<input type="hidden" name="lead_action" value="create" />
				<table class="form-table" style="margin:0;">
					<tr><th><label>Email *</label></th><td><input type="email" name="email" required class="regular-text" /></td></tr>
					<tr><th><label>First Name</label></th><td><input type="text" name="firstName" class="regular-text" /></td></tr>
					<tr><th><label>Last Name</label></th><td><input type="text" name="lastName" class="regular-text" /></td></tr>
					<tr><th><label>Phone</label></th><td><input type="text" name="phone" class="regular-text" /></td></tr>
					<tr><th><label>Company</label></th><td><input type="text" name="company" class="regular-text" /></td></tr>
				</table>
				<p><button type="submit" class="ax-btn ax-btn-primary">Create Lead</button> <a href="<?php echo esc_url( $base ); ?>" class="ax-btn">Cancel</a></p>
			</form>
		</div>
	<?php endif; ?>

	<!-- Filters -->
	<div class="ax-row" style="margin-bottom:16px;">
		<?php foreach ( array( 'all' => 'All', 'new' => 'New', 'contacted' => 'Contacted', 'qualified' => 'Qualified', 'converted' => 'Converted', 'lost' => 'Lost' ) as $key => $label ) : ?>
			<a href="<?php echo esc_url( $base . '&status=' . $key ); ?>" class="ax-btn <?php echo $filter === $key ? 'ax-btn-primary' : ''; ?>"><?php echo esc_html( $label ); ?></a>
		<?php endforeach; ?>
	</div>

	<div class="ax-table-wrap">
		<table class="ax-table">
			<thead><tr><th>Name / Email</th><th>Source</th><th>Status</th><th>Attribution</th><th>Created</th><th>Change Status</th></tr></thead>
			<tbody>
				<?php if ( empty( $leads ) ) : ?>
					<tr><td colspan="6" class="ax-empty">No leads yet.</td></tr>
				<?php else : ?>
					<?php foreach ( array_slice( $leads, 0, 100 ) as $l ) : ?>
						<tr>
							<td>
								<strong><?php echo esc_html( trim( ( $l['firstName'] ?? '' ) . ' ' . ( $l['lastName'] ?? '' ) ) ?: '—' ); ?></strong>
								<br><span style="color:#6b7280;font-size:12px;"><?php echo esc_html( $l['email'] ?? '' ); ?></span>
							</td>
							<td><span class="ax-badge ax-badge-gray"><?php echo esc_html( $source_labels[ $l['source'] ?? '' ] ?? ( $l['source'] ?? '—' ) ); ?></span></td>
							<td>
								<?php $st = $l['status'] ?? 'new'; ?>
								<span class="ax-badge ax-badge-<?php echo $status_colors[ $st ] ?? 'gray'; ?>"><?php echo esc_html( ucfirst( $st ) ); ?></span>
							</td>
							<td style="color:#6b7280;font-size:12px;">
								<?php
								$parts = array();
								if ( ! empty( $l['utmSource'] ) ) $parts[] = $l['utmSource'];
								if ( ! empty( $l['utmCampaign'] ) ) $parts[] = $l['utmCampaign'];
								echo esc_html( implode( ' · ', $parts ) ?: '—' );
								?>
							</td>
							<td style="color:#9ca3af;"><?php echo esc_html( isset( $l['createdAt'] ) ? date( 'M j', strtotime( $l['createdAt'] ) ) : '—' ); ?></td>
							<td>
								<form method="post" style="display:inline;">
									<?php wp_nonce_field( 'attribix_lead_action' ); ?>
									<input type="hidden" name="lead_action" value="update_status" />
									<input type="hidden" name="lead_id" value="<?php echo esc_attr( $l['id'] ?? '' ); ?>" />
									<select name="status" onchange="this.form.submit()" style="font-size:12px;padding:4px;">
										<?php foreach ( array( 'new', 'contacted', 'qualified', 'converted', 'lost' ) as $s ) : ?>
											<option value="<?php echo $s; ?>" <?php selected( $st, $s ); ?>><?php echo ucfirst( $s ); ?></option>
										<?php endforeach; ?>
									</select>
								</form>
							</td>
						</tr>
					<?php endforeach; ?>
				<?php endif; ?>
			</tbody>
		</table>
	</div>
</div>
