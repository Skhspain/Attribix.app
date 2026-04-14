<?php
/**
 * Admin Page: Newsletter Templates — Pick a template to start a new newsletter.
 */
if ( ! defined( 'ABSPATH' ) ) exit;

use Attribix_Woo\Api;
use Attribix_Woo\Settings;

$settings = Settings::get();
$templates = Api::get( '/api/standalone/newsletter/templates' );
$template_list = $templates['templates'] ?? array();
$categories = $templates['categories'] ?? array( 'All' );

// Handle create from template
if ( isset( $_POST['use_template'] ) && wp_verify_nonce( $_POST['_tpl_nonce'] ?? '', 'attribix_template' ) ) {
	$tpl_id = sanitize_text_field( $_POST['template_id'] ?? '' );
	$tpl = null;
	foreach ( $template_list as $t ) {
		if ( $t['id'] === $tpl_id ) { $tpl = $t; break; }
	}
	$result = Api::post( '/api/standalone/newsletter/update', array(
		'action'      => 'create-campaign',
		'name'        => $tpl['name'] ?? 'Untitled newsletter',
		'subject'     => '',
		'htmlContent' => $tpl['html'] ?? '',
		'designJson'  => ! empty( $tpl['design'] ) ? wp_json_encode( $tpl['design'] ) : null,
		'shop'        => Api::shop_domain(),
	) );
	if ( ! empty( $result['ok'] ) && ! empty( $result['campaign']['id'] ) ) {
		wp_redirect( admin_url( 'admin.php?page=attribix-newsletter-editor&id=' . $result['campaign']['id'] ) );
		exit;
	}
}
?>
<div class="wrap ax-wrap">
	<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
		<div>
			<h1>Choose a Template</h1>
			<a href="<?php echo esc_url( admin_url( 'admin.php?page=attribix-newsletter' ) ); ?>" style="color:#6b7280;font-size:13px;">← Back to Newsletters</a>
		</div>
		<a href="<?php echo esc_url( admin_url( 'admin.php?page=attribix-newsletter-editor' ) ); ?>" class="ax-btn ax-btn-primary">Start Blank →</a>
	</div>

	<!-- Blank / Start from scratch -->
	<div style="margin-top:20px;">
		<form method="post" style="margin:0;display:inline-block;">
			<?php wp_nonce_field( 'attribix_template', '_tpl_nonce' ); ?>
			<input type="hidden" name="use_template" value="1" />
			<input type="hidden" name="template_id" value="blank" />
			<button type="submit" style="border:2px dashed #d1d5db;border-radius:10px;padding:20px 40px;background:#f9fafb;cursor:pointer;text-align:center;">
				<span style="font-size:24px;">✨</span>
				<span style="font-weight:600;font-size:14px;margin-left:8px;">Start Blank</span>
			</button>
		</form>
	</div>

	<?php
	// Group templates by category
	$grouped = array();
	foreach ( $template_list as $idx => $tpl ) {
		$cat = $tpl['category'] ?? 'Other';
		if ( ! isset( $grouped[ $cat ] ) ) $grouped[ $cat ] = array();
		$tpl['_idx'] = $idx;
		$grouped[ $cat ][] = $tpl;
	}

	// Define category display order and icons
	$category_meta = array(
		'Welcome'          => array( 'icon' => '👋', 'desc' => 'First impression emails for new subscribers' ),
		'Promotions'       => array( 'icon' => '🔥', 'desc' => 'Sales, discounts, and special offers' ),
		'Products'         => array( 'icon' => '🛍️', 'desc' => 'Product highlights and collections' ),
		'New Product'      => array( 'icon' => '✨', 'desc' => 'Launch and announce new products' ),
		'Post-purchase'    => array( 'icon' => '🎉', 'desc' => 'Thank you and order follow-ups' ),
		'Review Requests'  => array( 'icon' => '⭐', 'desc' => 'Ask customers for reviews after purchase' ),
		'Win-back'         => array( 'icon' => '💌', 'desc' => 'Re-engage inactive customers' ),
		'Newsletter'       => array( 'icon' => '📰', 'desc' => 'Regular updates and content digests' ),
		'Announcements'    => array( 'icon' => '📢', 'desc' => 'Company news and announcements' ),
	);

	// Move "Review Request" templates into their own category
	foreach ( $grouped as $cat => &$items ) {
		foreach ( $items as $key => $tpl ) {
			$name_lower = strtolower( $tpl['name'] ?? '' );
			if ( strpos( $name_lower, 'review' ) !== false ) {
				if ( ! isset( $grouped['Review Requests'] ) ) $grouped['Review Requests'] = array();
				$grouped['Review Requests'][] = $tpl;
				unset( $items[ $key ] );
			}
		}
		$items = array_values( $items );
	}
	unset( $items );

	// Remove empty categories
	$grouped = array_filter( $grouped, function( $items ) { return ! empty( $items ); } );

	// Sort categories in the defined order
	$ordered = array();
	foreach ( array_keys( $category_meta ) as $cat ) {
		if ( isset( $grouped[ $cat ] ) ) {
			$ordered[ $cat ] = $grouped[ $cat ];
			unset( $grouped[ $cat ] );
		}
	}
	// Append any remaining categories not in the defined order
	$grouped = array_merge( $ordered, $grouped );

	foreach ( $grouped as $cat => $templates_in_cat ) :
		$meta = $category_meta[ $cat ] ?? array( 'icon' => '📧', 'desc' => '' );
	?>
		<div style="margin-top:32px;">
			<div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">
				<span style="font-size:24px;"><?php echo $meta['icon']; ?></span>
				<div>
					<h2 style="margin:0;font-size:18px;font-weight:700;"><?php echo esc_html( $cat ); ?></h2>
					<?php if ( $meta['desc'] ) : ?>
						<p style="margin:2px 0 0;font-size:13px;color:#6b7280;"><?php echo esc_html( $meta['desc'] ); ?></p>
					<?php endif; ?>
				</div>
			</div>

			<div style="display:grid;grid-template-columns:repeat(auto-fill, minmax(220px, 1fr));gap:16px;">
				<?php foreach ( $templates_in_cat as $tpl ) :
					$has_html = ! empty( $tpl['html'] );
					$preview_id = 'tpl-preview-' . $tpl['_idx'];
				?>
					<form method="post" style="margin:0;">
						<?php wp_nonce_field( 'attribix_template', '_tpl_nonce' ); ?>
						<input type="hidden" name="use_template" value="1" />
						<input type="hidden" name="template_id" value="<?php echo esc_attr( $tpl['id'] ); ?>" />
						<button type="submit" style="width:100%;border:1px solid #e5e7eb;border-radius:10px;padding:0;background:#fff;cursor:pointer;text-align:left;transition:box-shadow 0.15s;overflow:hidden;"
							onmouseenter="this.style.boxShadow='0 4px 16px rgba(0,0,0,0.12)'"
							onmouseleave="this.style.boxShadow='none'">
							<div style="height:160px;overflow:hidden;position:relative;background:#f9fafb;border-bottom:1px solid #e5e7eb;">
								<?php if ( $has_html ) : ?>
									<iframe id="<?php echo esc_attr( $preview_id ); ?>" style="width:600px;height:800px;border:none;transform:scale(0.37);transform-origin:top left;pointer-events:none;" srcdoc="<?php echo esc_attr( $tpl['html'] ); ?>"></iframe>
								<?php else : ?>
									<div style="height:100%;display:flex;align-items:center;justify-content:center;background:<?php echo esc_attr( $tpl['primaryColor'] ?? '#6366f1' ); ?>;color:#fff;font-size:28px;">📧</div>
								<?php endif; ?>
							</div>
							<div style="padding:12px 14px;">
								<div style="font-weight:600;font-size:14px;color:#111827;"><?php echo esc_html( $tpl['name'] ?? 'Template' ); ?></div>
							</div>
						</button>
					</form>
				<?php endforeach; ?>
			</div>
		</div>
	<?php endforeach; ?>
</div>
