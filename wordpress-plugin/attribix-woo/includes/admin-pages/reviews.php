<?php
/**
 * Admin Page: Reviews — Manage product reviews.
 */
if ( ! defined( 'ABSPATH' ) ) exit;

use Attribix_Woo\Api;
use Attribix_Woo\Settings;

$settings = Settings::get();
$shop     = Api::shop_domain();
$data     = Api::get( '/api/standalone/reviews', array( 'shop' => $shop, 'accountId' => $settings['account_id'] ) );

$reviews = $data['reviews'] ?? array();
$stats   = $data['stats'] ?? array();

// Handle approve/reject
if ( isset( $_POST['review_action'] ) && wp_verify_nonce( $_POST['_wpnonce'] ?? '', 'attribix_review_action' ) ) {
	$action    = sanitize_key( $_POST['review_action'] );
	$review_id = sanitize_text_field( $_POST['review_id'] ?? '' );
	if ( $review_id && in_array( $action, array( 'approve', 'reject' ) ) ) {
		Api::post( '/api/standalone/reviews/update', array(
			'action' => $action,
			'id'     => $review_id,
			'shop'   => $shop,
			'accountId' => $settings['account_id'],
		) );
		echo '<div class="notice notice-success"><p>Review ' . esc_html( $action ) . 'd successfully.</p></div>';
		// Reload data
		$data    = Api::get( '/api/standalone/reviews', array( 'shop' => $shop, 'accountId' => $settings['account_id'] ) );
		$reviews = $data['reviews'] ?? array();
		$stats   = $data['stats'] ?? array();
	}
}

$filter = isset( $_GET['status'] ) ? sanitize_key( $_GET['status'] ) : 'all';
if ( $filter !== 'all' ) {
	$reviews = array_filter( $reviews, function( $r ) use ( $filter ) { return ( $r['status'] ?? '' ) === $filter; } );
}
?>
<div class="wrap ax-wrap">
	<h1 style="display:flex;align-items:center;gap:10px;">
		<span style="font-size:24px;">⭐</span> Reviews
	</h1>

	<div class="ax-cards" style="grid-template-columns:repeat(4,1fr);">
		<div class="ax-card">
			<p class="ax-card-label">Total Reviews</p>
			<p class="ax-card-value"><?php echo (int) ( $stats['total'] ?? count( $reviews ) ); ?></p>
		</div>
		<div class="ax-card">
			<p class="ax-card-label">Avg Rating</p>
			<p class="ax-card-value"><?php echo number_format( $stats['avgRating'] ?? 0, 1 ); ?> ⭐</p>
		</div>
		<div class="ax-card">
			<p class="ax-card-label">Pending</p>
			<p class="ax-card-value" style="color:#f59e0b;"><?php echo (int) ( $stats['pending'] ?? 0 ); ?></p>
		</div>
		<div class="ax-card">
			<p class="ax-card-label">Approved</p>
			<p class="ax-card-value" style="color:#16a34a;"><?php echo (int) ( $stats['approved'] ?? 0 ); ?></p>
		</div>
	</div>

	<!-- Action Buttons -->
	<div style="display:flex;gap:12px;margin:20px 0;">
		<a href="<?php echo esc_url( admin_url( 'admin.php?page=attribix-review-settings' ) ); ?>" style="display:inline-flex;align-items:center;gap:8px;padding:12px 24px;background:#6366f1;color:#fff;border-radius:8px;font-size:15px;font-weight:600;text-decoration:none;transition:background 0.15s;" onmouseenter="this.style.background='#4f46e5'" onmouseleave="this.style.background='#6366f1'">
			🎨 Customize Widget
		</a>
		<a href="<?php echo esc_url( admin_url( 'admin.php?page=attribix-newsletter-templates' ) ); ?>" style="display:inline-flex;align-items:center;gap:8px;padding:12px 24px;background:#16a34a;color:#fff;border-radius:8px;font-size:15px;font-weight:600;text-decoration:none;transition:background 0.15s;" onmouseenter="this.style.background='#15803d'" onmouseleave="this.style.background='#16a34a'">
			📧 Send Review Request
		</a>
	</div>

	<!-- Filter -->
	<div class="ax-row" style="margin-bottom:16px;">
		<?php
		$base = admin_url( 'admin.php?page=attribix-reviews' );
		$filters = array( 'all' => 'All', 'pending' => 'Pending', 'approved' => 'Approved', 'rejected' => 'Rejected' );
		foreach ( $filters as $key => $label ) :
		?>
			<a href="<?php echo esc_url( $base . '&status=' . $key ); ?>" class="ax-btn <?php echo $filter === $key ? 'ax-btn-primary' : ''; ?>">
				<?php echo esc_html( $label ); ?>
			</a>
		<?php endforeach; ?>
	</div>

	<div class="ax-table-wrap">
		<table class="ax-table">
			<thead>
				<tr><th>Product</th><th>Rating</th><th>Review</th><th>Author</th><th>Status</th><th>Actions</th></tr>
			</thead>
			<tbody>
				<?php if ( empty( $reviews ) ) : ?>
					<tr><td colspan="6" class="ax-empty">No reviews yet.</td></tr>
				<?php else : ?>
					<?php foreach ( array_slice( $reviews, 0, 50 ) as $r ) : ?>
						<tr>
							<td style="max-width:150px;">
								<strong><?php echo esc_html( $r['productTitle'] ?? $r['productId'] ?? '—' ); ?></strong>
							</td>
							<td style="white-space:nowrap;">
								<?php echo str_repeat( '⭐', (int) ( $r['rating'] ?? 0 ) ); ?>
							</td>
							<td style="max-width:300px;font-size:12px;color:#374151;">
								<?php echo esc_html( mb_substr( $r['body'] ?? $r['text'] ?? '', 0, 120 ) ); ?>
								<?php if ( strlen( $r['body'] ?? $r['text'] ?? '' ) > 120 ) echo '…'; ?>
							</td>
							<td style="color:#6b7280;font-size:12px;">
								<?php echo esc_html( $r['reviewerName'] ?? $r['author'] ?? '—' ); ?>
							</td>
							<td>
								<?php
								$st = $r['status'] ?? 'pending';
								$tone = $st === 'approved' ? 'green' : ( $st === 'rejected' ? 'red' : 'yellow' );
								?>
								<span class="ax-badge ax-badge-<?php echo $tone; ?>"><?php echo esc_html( $st ); ?></span>
							</td>
							<td style="white-space:nowrap;">
								<?php if ( ( $r['status'] ?? '' ) !== 'approved' ) : ?>
									<form method="post" style="display:inline;">
										<?php wp_nonce_field( 'attribix_review_action' ); ?>
										<input type="hidden" name="review_id" value="<?php echo esc_attr( $r['id'] ?? '' ); ?>" />
										<input type="hidden" name="review_action" value="approve" />
										<button type="submit" class="ax-btn" style="color:#16a34a;padding:4px 10px;font-size:12px;">✓ Approve</button>
									</form>
								<?php endif; ?>
								<?php if ( ( $r['status'] ?? '' ) !== 'rejected' ) : ?>
									<form method="post" style="display:inline;">
										<?php wp_nonce_field( 'attribix_review_action' ); ?>
										<input type="hidden" name="review_id" value="<?php echo esc_attr( $r['id'] ?? '' ); ?>" />
										<input type="hidden" name="review_action" value="reject" />
										<button type="submit" class="ax-btn" style="color:#dc2626;padding:4px 10px;font-size:12px;">✗ Reject</button>
									</form>
								<?php endif; ?>
							</td>
						</tr>
					<?php endforeach; ?>
				<?php endif; ?>
			</tbody>
		</table>
	</div>

	<?php if ( ! $settings['reviews_enabled'] ) : ?>
		<div class="notice notice-info" style="margin-top:16px;">
			<p>Review widget is disabled. <a href="<?php echo esc_url( admin_url( 'admin.php?page=attribix-woo-settings&tab=reviews' ) ); ?>">Enable it</a> to show reviews on product pages.</p>
		</div>
	<?php endif; ?>
</div>
