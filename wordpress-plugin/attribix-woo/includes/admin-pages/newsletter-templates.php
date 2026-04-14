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

	<div style="display:grid;grid-template-columns:repeat(auto-fill, minmax(220px, 1fr));gap:16px;margin-top:20px;">
		<!-- Blank template -->
		<form method="post" style="margin:0;">
			<?php wp_nonce_field( 'attribix_template', '_tpl_nonce' ); ?>
			<input type="hidden" name="use_template" value="1" />
			<input type="hidden" name="template_id" value="blank" />
			<button type="submit" style="width:100%;border:2px dashed #d1d5db;border-radius:10px;padding:40px 16px;background:#f9fafb;cursor:pointer;text-align:center;">
				<div style="font-size:36px;margin-bottom:8px;">✨</div>
				<div style="font-weight:600;font-size:14px;">Blank</div>
				<div style="font-size:12px;color:#6b7280;margin-top:4px;">Start from scratch</div>
			</button>
		</form>

		<?php foreach ( $template_list as $tpl ) : ?>
			<form method="post" style="margin:0;">
				<?php wp_nonce_field( 'attribix_template', '_tpl_nonce' ); ?>
				<input type="hidden" name="use_template" value="1" />
				<input type="hidden" name="template_id" value="<?php echo esc_attr( $tpl['id'] ); ?>" />
				<button type="submit" style="width:100%;border:1px solid #e5e7eb;border-radius:10px;padding:16px;background:#fff;cursor:pointer;text-align:left;transition:box-shadow 0.15s;"
					onmouseenter="this.style.boxShadow='0 2px 12px rgba(0,0,0,0.08)'"
					onmouseleave="this.style.boxShadow='none'">
					<div style="background:<?php echo esc_attr( $tpl['primaryColor'] ?? '#6366f1' ); ?>;height:80px;border-radius:6px;margin-bottom:10px;display:flex;align-items:center;justify-content:center;color:#fff;font-size:24px;">
						📧
					</div>
					<div style="font-weight:600;font-size:14px;"><?php echo esc_html( $tpl['name'] ?? 'Template' ); ?></div>
					<div style="font-size:12px;color:#6b7280;margin-top:4px;"><?php echo esc_html( $tpl['category'] ?? '' ); ?></div>
				</button>
			</form>
		<?php endforeach; ?>
	</div>
</div>
