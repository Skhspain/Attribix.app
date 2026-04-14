<?php
/**
 * Admin Page: Automation Flows — Welcome, post-purchase, win-back, abandoned cart.
 */
if ( ! defined( 'ABSPATH' ) ) exit;

use Attribix_Woo\Api;

$flows_data = Api::get( '/api/standalone/newsletter/flows' );
$flows = $flows_data['flows'] ?? array();

$templates = array(
	array( 'name' => 'Welcome Series', 'trigger' => 'subscriber_created', 'icon' => '👋', 'desc' => 'Send a 3-email warm-up to new subscribers over 7 days', 'steps' => 3, 'color' => '#6366f1' ),
	array( 'name' => 'Post-Purchase', 'trigger' => 'order_created', 'icon' => '🎉', 'desc' => 'Thank you → review request → upsell after a purchase', 'steps' => 3, 'color' => '#16a34a' ),
	array( 'name' => 'Win-Back', 'trigger' => 'win_back', 'icon' => '💌', 'desc' => 'Re-engage customers who haven\'t ordered in 60+ days', 'steps' => 3, 'color' => '#f59e0b' ),
	array( 'name' => 'Abandoned Cart', 'trigger' => 'cart_abandoned', 'icon' => '🛒', 'desc' => 'Recover lost sales with 1h, 24h, and 72h follow-ups', 'steps' => 3, 'color' => '#ef4444' ),
	array( 'name' => 'VIP / Loyalty', 'trigger' => 'order_created', 'icon' => '👑', 'desc' => 'Reward customers after 3+ orders', 'steps' => 2, 'color' => '#8b5cf6' ),
	array( 'name' => 'Review Request', 'trigger' => 'order_fulfilled', 'icon' => '⭐', 'desc' => 'Automatically ask for reviews after delivery', 'steps' => 2, 'color' => '#06b6d4' ),
);
?>
<div class="wrap ax-wrap">
	<h1>Automation Flows</h1>
	<p style="color:#6b7280;">Automated email sequences triggered by customer actions.</p>

	<!-- Active Flows -->
	<?php if ( ! empty( $flows ) ) : ?>
	<div class="ax-section">
		<h2 class="ax-section-title">Active Flows</h2>
		<div class="ax-table-wrap">
			<table class="ax-table">
				<thead><tr><th>Flow</th><th>Trigger</th><th>Steps</th><th>Status</th><th>Enrolled</th></tr></thead>
				<tbody>
					<?php foreach ( $flows as $f ) : ?>
						<tr>
							<td><strong><?php echo esc_html( $f['name'] ?? 'Unnamed' ); ?></strong></td>
							<td style="color:#6b7280;font-size:12px;"><?php echo esc_html( $f['trigger'] ?? '—' ); ?></td>
							<td><?php echo (int) ( $f['stepCount'] ?? 0 ); ?></td>
							<td><span class="ax-badge <?php echo ! empty( $f['enabled'] ) ? 'ax-badge-green' : 'ax-badge-gray'; ?>"><?php echo ! empty( $f['enabled'] ) ? 'Active' : 'Paused'; ?></span></td>
							<td><?php echo (int) ( $f['enrollmentCount'] ?? 0 ); ?></td>
						</tr>
					<?php endforeach; ?>
				</tbody>
			</table>
		</div>
	</div>
	<?php endif; ?>

	<!-- Flow Templates -->
	<div class="ax-section">
		<h2 class="ax-section-title">Start a New Flow</h2>
		<div style="display:grid;grid-template-columns:repeat(auto-fill, minmax(280px, 1fr));gap:16px;margin-top:12px;">
			<?php foreach ( $templates as $t ) : ?>
				<div style="border:1px solid #e5e7eb;border-radius:10px;padding:20px;background:#fff;border-left:4px solid <?php echo esc_attr( $t['color'] ); ?>;">
					<div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">
						<span style="font-size:28px;"><?php echo $t['icon']; ?></span>
						<div>
							<div style="font-weight:600;font-size:15px;"><?php echo esc_html( $t['name'] ); ?></div>
							<div style="font-size:11px;color:#6b7280;"><?php echo $t['steps']; ?> email steps · Trigger: <?php echo esc_html( $t['trigger'] ); ?></div>
						</div>
					</div>
					<p style="font-size:13px;color:#374151;margin:0 0 12px;"><?php echo esc_html( $t['desc'] ); ?></p>
					<button class="ax-btn" disabled style="opacity:0.6;cursor:not-allowed;">Coming soon</button>
				</div>
			<?php endforeach; ?>
		</div>
	</div>
</div>
