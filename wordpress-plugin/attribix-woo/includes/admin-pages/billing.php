<?php
/**
 * Admin Page: Billing — Plans & subscription management.
 */
if ( ! defined( 'ABSPATH' ) ) exit;

$plans = array(
	array(
		'name'     => 'Starter',
		'price'    => '$39',
		'period'   => '/mo',
		'features' => array(
			'300 orders tracked/mo',
			'500 newsletter sends/mo',
			'50 reviews/mo',
			'25 leads/mo',
			'30 days analytics history',
			'Meta & Google Ads data',
			'SEO Audit',
			'UTM Builder',
		),
		'color'    => '#e5e7eb',
	),
	array(
		'name'     => 'Growth',
		'price'    => '$79',
		'period'   => '/mo',
		'badge'    => 'Recommended',
		'features' => array(
			'2,500 orders tracked/mo',
			'5,000 subscribers',
			'20,000 newsletter sends/mo',
			'Unlimited reviews & leads',
			'90 days analytics history',
			'Product feeds (Google & Meta)',
			'Automation flows',
			'Signup widget builder',
		),
		'color'    => '#6366f1',
	),
	array(
		'name'     => 'Pro',
		'price'    => '$149',
		'period'   => '/mo',
		'features' => array(
			'Unlimited orders',
			'Unlimited subscribers & sends',
			'Unlimited reviews & leads',
			'365 days analytics history',
			'Visitor flow analysis',
			'Priority support',
			'All features included',
			'Custom integrations',
		),
		'color'    => '#111827',
	),
);
?>
<div class="wrap ax-wrap">
	<h1 style="display:flex;align-items:center;gap:10px;">
		<span style="font-size:24px;">💳</span> Plans & Billing
	</h1>

	<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:20px;margin-top:24px;max-width:900px;">
		<?php foreach ( $plans as $plan ) : ?>
			<div style="background:#fff;border:2px solid <?php echo $plan['color']; ?>;border-radius:12px;padding:24px;position:relative;">
				<?php if ( ! empty( $plan['badge'] ) ) : ?>
					<div style="position:absolute;top:-12px;right:16px;background:<?php echo $plan['color']; ?>;color:#fff;padding:4px 12px;border-radius:12px;font-size:11px;font-weight:600;">
						<?php echo esc_html( $plan['badge'] ); ?>
					</div>
				<?php endif; ?>
				<h3 style="margin:0 0 4px;font-size:18px;"><?php echo esc_html( $plan['name'] ); ?></h3>
				<div style="margin:12px 0 20px;">
					<span style="font-size:36px;font-weight:700;"><?php echo esc_html( $plan['price'] ); ?></span>
					<span style="color:#6b7280;"><?php echo esc_html( $plan['period'] ); ?></span>
				</div>
				<ul style="list-style:none;padding:0;margin:0;">
					<?php foreach ( $plan['features'] as $f ) : ?>
						<li style="padding:6px 0;font-size:13px;color:#374151;border-bottom:1px solid #f3f4f6;">
							<span style="color:#16a34a;margin-right:6px;">✓</span> <?php echo esc_html( $f ); ?>
						</li>
					<?php endforeach; ?>
				</ul>
				<div style="margin-top:20px;">
					<a href="https://attribix.app/analytics/billing" target="_blank" class="ax-btn ax-btn-primary" style="display:block;text-align:center;">
						Select Plan
					</a>
				</div>
			</div>
		<?php endforeach; ?>
	</div>

	<div class="notice notice-info" style="margin-top:24px;max-width:900px;">
		<p>Manage your subscription, view billing history, and change plans from your <a href="https://attribix.app/analytics/billing" target="_blank">Attribix Dashboard</a>.</p>
	</div>
</div>
