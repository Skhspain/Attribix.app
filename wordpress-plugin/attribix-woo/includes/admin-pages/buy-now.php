<?php
/**
 * Admin Page: Buy Now Button — Visual config, preview, click analytics.
 */
if ( ! defined( 'ABSPATH' ) ) exit;

use Attribix_Woo\Settings;

$settings = Settings::get();
$btn_color = $settings['buy_now_color'] ?? '#111827';
$btn_text = $settings['buy_now_text'] ?? 'Buy Now';
$btn_size = $settings['buy_now_size'] ?? 'medium';
$btn_radius = $settings['buy_now_radius'] ?? '6px';
$btn_enabled = $settings['buy_now_enabled'] ?? false;

if ( isset( $_POST['buy_now_save'] ) && wp_verify_nonce( $_POST['_bn_nonce'] ?? '', 'attribix_buy_now' ) ) {
	$settings['buy_now_color'] = sanitize_hex_color( $_POST['btn_color'] ?? '#111827' );
	$settings['buy_now_text'] = sanitize_text_field( $_POST['btn_text'] ?? 'Buy Now' );
	$settings['buy_now_size'] = sanitize_key( $_POST['btn_size'] ?? 'medium' );
	$settings['buy_now_radius'] = sanitize_text_field( $_POST['btn_radius'] ?? '6px' );
	$settings['buy_now_enabled'] = ! empty( $_POST['btn_enabled'] );
	update_option( ATTRIBIX_WOO_OPTION, $settings );
	$btn_color = $settings['buy_now_color'];
	$btn_text = $settings['buy_now_text'];
	$btn_size = $settings['buy_now_size'];
	$btn_radius = $settings['buy_now_radius'];
	$btn_enabled = $settings['buy_now_enabled'];
	echo '<div class="notice notice-success"><p>Buy Now Button settings saved.</p></div>';
}

$sizes = array( 'small' => '8px 16px', 'medium' => '11px 22px', 'large' => '14px 28px' );
$padding = $sizes[ $btn_size ] ?? $sizes['medium'];
?>
<div class="wrap ax-wrap">
	<h1>Buy Now Button</h1>
	<p style="color:#6b7280;">Add a quick-checkout button to your product pages.</p>

	<div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-top:20px;">
		<!-- Settings -->
		<form method="post">
			<?php wp_nonce_field( 'attribix_buy_now', '_bn_nonce' ); ?>
			<input type="hidden" name="buy_now_save" value="1" />

			<div class="ax-card" style="padding:20px;">
				<h3 style="margin:0 0 16px;">Button Settings</h3>
				<table class="form-table" style="margin:0;">
					<tr><th><label>Enabled</label></th><td><label><input type="checkbox" name="btn_enabled" value="1" <?php checked( $btn_enabled ); ?> /> Show on product pages</label></td></tr>
					<tr><th><label>Button Text</label></th><td><input type="text" name="btn_text" value="<?php echo esc_attr( $btn_text ); ?>" class="regular-text" /></td></tr>
					<tr><th><label>Color</label></th><td><input type="color" name="btn_color" value="<?php echo esc_attr( $btn_color ); ?>" /></td></tr>
					<tr><th><label>Size</label></th><td>
						<select name="btn_size">
							<option value="small" <?php selected( $btn_size, 'small' ); ?>>Small</option>
							<option value="medium" <?php selected( $btn_size, 'medium' ); ?>>Medium</option>
							<option value="large" <?php selected( $btn_size, 'large' ); ?>>Large</option>
						</select>
					</td></tr>
					<tr><th><label>Border Radius</label></th><td><input type="text" name="btn_radius" value="<?php echo esc_attr( $btn_radius ); ?>" class="small-text" placeholder="6px" /></td></tr>
				</table>
				<?php submit_button( 'Save Settings' ); ?>
			</div>
		</form>

		<!-- Preview -->
		<div>
			<div class="ax-card" style="padding:20px;">
				<h3 style="margin:0 0 16px;">Live Preview</h3>
				<div style="background:#f9fafb;border-radius:8px;padding:40px;text-align:center;">
					<div style="font-size:14px;color:#374151;margin-bottom:12px;">Product Name — $49.99</div>
					<button style="background:<?php echo esc_attr( $btn_color ); ?>;color:#fff;border:none;border-radius:<?php echo esc_attr( $btn_radius ); ?>;padding:<?php echo esc_attr( $padding ); ?>;font-size:15px;font-weight:600;cursor:pointer;">
						<?php echo esc_html( $btn_text ); ?>
					</button>
				</div>
			</div>

			<div class="ax-card" style="padding:20px;margin-top:16px;">
				<h3 style="margin:0 0 8px;">Shortcode</h3>
				<p style="font-size:13px;color:#6b7280;">Add to any page or use the auto-injection (enabled above):</p>
				<div style="background:#f0f0f1;padding:10px 14px;border-radius:6px;font-family:monospace;font-size:13px;margin-top:8px;">
					[attribix_buy_now]
				</div>
			</div>
		</div>
	</div>
</div>
