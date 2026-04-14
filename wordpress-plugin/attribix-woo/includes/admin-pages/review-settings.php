<?php
/**
 * Admin Page: Review Widget Settings — Colors, layout, language, auto-detect.
 */
if ( ! defined( 'ABSPATH' ) ) exit;

use Attribix_Woo\Api;
use Attribix_Woo\Settings;

$settings = Settings::get();
$widget = Api::get( '/api/standalone/reviews/settings', array( 'shop' => Api::shop_domain() ) );
$ws = $widget['settings'] ?? array();

// Handle save
if ( isset( $_POST['review_settings_save'] ) && wp_verify_nonce( $_POST['_rs_nonce'] ?? '', 'attribix_review_settings' ) ) {
	$save = Api::post( '/api/standalone/reviews/settings', array(
		'action'           => 'update',
		'shop'             => Api::shop_domain(),
		'primaryColor'     => sanitize_hex_color( $_POST['primaryColor'] ?? '#4f46e5' ),
		'starColor'        => sanitize_hex_color( $_POST['starColor'] ?? '#f59e0b' ),
		'backgroundColor'  => sanitize_hex_color( $_POST['backgroundColor'] ?? '#ffffff' ),
		'borderColor'      => sanitize_hex_color( $_POST['borderColor'] ?? '#e5e7eb' ),
		'layout'           => sanitize_key( $_POST['layout'] ?? 'list' ),
		'showVerifiedBadge' => ! empty( $_POST['showVerifiedBadge'] ),
		'showReviewerName' => ! empty( $_POST['showReviewerName'] ),
		'showDate'         => ! empty( $_POST['showDate'] ),
		'allowImages'      => ! empty( $_POST['allowImages'] ),
		'translateTo'      => sanitize_text_field( $_POST['translateTo'] ?? '' ),
	) );
	if ( ! empty( $save['ok'] ) ) {
		echo '<div class="notice notice-success"><p>Widget settings saved.</p></div>';
		$ws = array_merge( $ws, $_POST );
	}
}

$presets = array(
	array( 'name' => 'Indigo',   'primary' => '#4f46e5', 'star' => '#f59e0b', 'bg' => '#ffffff', 'border' => '#e5e7eb' ),
	array( 'name' => 'Shopify',  'primary' => '#008060', 'star' => '#f59e0b', 'bg' => '#ffffff', 'border' => '#e5e7eb' ),
	array( 'name' => 'Minimal',  'primary' => '#111827', 'star' => '#111827', 'bg' => '#ffffff', 'border' => '#f3f4f6' ),
	array( 'name' => 'Warm',     'primary' => '#ea580c', 'star' => '#f59e0b', 'bg' => '#fffbeb', 'border' => '#fde68a' ),
	array( 'name' => 'Rose',     'primary' => '#e11d48', 'star' => '#f59e0b', 'bg' => '#fff1f2', 'border' => '#fecdd3' ),
	array( 'name' => 'Dark',     'primary' => '#f8fafc', 'star' => '#f59e0b', 'bg' => '#0f172a', 'border' => '#334155' ),
);

$languages = array( '' => 'English (default)', 'no' => 'Norwegian', 'sv' => 'Swedish', 'da' => 'Danish', 'de' => 'German', 'fr' => 'French', 'es' => 'Spanish', 'nl' => 'Dutch', 'it' => 'Italian', 'pt' => 'Portuguese', 'fi' => 'Finnish', 'pl' => 'Polish', 'ja' => 'Japanese', 'zh-CN' => 'Chinese' );
?>
<div class="wrap ax-wrap">
	<h1>Review Widget Settings</h1>
	<a href="<?php echo esc_url( admin_url( 'admin.php?page=attribix-reviews' ) ); ?>" style="color:#6b7280;font-size:13px;">← Back to Reviews</a>

	<form method="post" style="margin-top:20px;max-width:700px;">
		<?php wp_nonce_field( 'attribix_review_settings', '_rs_nonce' ); ?>
		<input type="hidden" name="review_settings_save" value="1" />

		<!-- Color Presets -->
		<h3>Color Presets</h3>
		<div style="display:flex;gap:8px;margin-bottom:20px;">
			<?php foreach ( $presets as $p ) : ?>
				<button type="button" onclick="document.getElementById('pc').value='<?php echo $p['primary']; ?>';document.getElementById('sc').value='<?php echo $p['star']; ?>';document.getElementById('bc').value='<?php echo $p['bg']; ?>';document.getElementById('brc').value='<?php echo $p['border']; ?>';"
					style="padding:8px 14px;border:1px solid #d1d5db;border-radius:6px;background:#fff;cursor:pointer;font-size:12px;">
					<span style="display:inline-block;width:12px;height:12px;border-radius:50%;background:<?php echo $p['primary']; ?>;vertical-align:middle;margin-right:4px;"></span>
					<?php echo esc_html( $p['name'] ); ?>
				</button>
			<?php endforeach; ?>
		</div>

		<table class="form-table">
			<tr><th>Primary Color</th><td><input type="color" name="primaryColor" id="pc" value="<?php echo esc_attr( $ws['primaryColor'] ?? '#4f46e5' ); ?>" /></td></tr>
			<tr><th>Star Color</th><td><input type="color" name="starColor" id="sc" value="<?php echo esc_attr( $ws['starColor'] ?? '#f59e0b' ); ?>" /></td></tr>
			<tr><th>Background</th><td><input type="color" name="backgroundColor" id="bc" value="<?php echo esc_attr( $ws['backgroundColor'] ?? '#ffffff' ); ?>" /></td></tr>
			<tr><th>Border Color</th><td><input type="color" name="borderColor" id="brc" value="<?php echo esc_attr( $ws['borderColor'] ?? '#e5e7eb' ); ?>" /></td></tr>
			<tr><th>Layout</th><td>
				<select name="layout">
					<option value="list" <?php selected( $ws['layout'] ?? 'list', 'list' ); ?>>List</option>
					<option value="grid" <?php selected( $ws['layout'] ?? '', 'grid' ); ?>>Grid</option>
					<option value="carousel" <?php selected( $ws['layout'] ?? '', 'carousel' ); ?>>Carousel</option>
				</select>
			</td></tr>
			<tr><th>Language</th><td>
				<select name="translateTo">
					<?php foreach ( $languages as $code => $label ) : ?>
						<option value="<?php echo esc_attr( $code ); ?>" <?php selected( $ws['translateTo'] ?? '', $code ); ?>><?php echo esc_html( $label ); ?></option>
					<?php endforeach; ?>
				</select>
			</td></tr>
			<tr><th>Options</th><td>
				<label><input type="checkbox" name="showVerifiedBadge" value="1" <?php checked( $ws['showVerifiedBadge'] ?? true ); ?> /> Show verified badge</label><br>
				<label><input type="checkbox" name="showReviewerName" value="1" <?php checked( $ws['showReviewerName'] ?? true ); ?> /> Show reviewer name</label><br>
				<label><input type="checkbox" name="showDate" value="1" <?php checked( $ws['showDate'] ?? true ); ?> /> Show date</label><br>
				<label><input type="checkbox" name="allowImages" value="1" <?php checked( $ws['allowImages'] ?? true ); ?> /> Allow image uploads</label>
			</td></tr>
		</table>
		<?php submit_button( 'Save Widget Settings' ); ?>
	</form>
</div>
