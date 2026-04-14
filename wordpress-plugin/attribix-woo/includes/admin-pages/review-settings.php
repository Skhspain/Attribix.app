<?php
/**
 * Admin Page: Review Widget Settings — Colors, layout, language, auto-detect, live preview.
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

// Handle fetch store style
$detected = null;
if ( isset( $_POST['fetch_style'] ) && wp_verify_nonce( $_POST['_rs_nonce'] ?? '', 'attribix_review_settings' ) ) {
	$store_url = home_url();
	try {
		$html = wp_remote_retrieve_body( wp_remote_get( $store_url, array( 'timeout' => 10 ) ) );
		// Extract button colors from CSS
		$btn_color = '#4f46e5';
		$btn_radius = '6px';
		$font = 'inherit';
		if ( preg_match( '/\.button[^{]*\{[^}]*background(?:-color)?\s*:\s*([^;}\s]+)/i', $html, $m ) ) $btn_color = trim( $m[1] );
		if ( preg_match( '/\.button[^{]*\{[^}]*border-radius\s*:\s*([^;}\s]+)/i', $html, $m ) ) $btn_radius = trim( $m[1] );
		if ( preg_match( '/body\s*\{[^}]*font-family\s*:\s*([^;}]+)/i', $html, $m ) ) $font = trim( $m[1] );
		// Also check WooCommerce button
		if ( preg_match( '/\.woocommerce\s+\.button[^{]*\{[^}]*background(?:-color)?\s*:\s*([^;}\s]+)/i', $html, $m ) ) $btn_color = trim( $m[1] );
		$detected = array( 'primaryColor' => $btn_color, 'borderRadius' => $btn_radius, 'font' => $font );
		echo '<div class="notice notice-info"><p>Store style detected! Primary color: <code>' . esc_html( $btn_color ) . '</code>, Border radius: <code>' . esc_html( $btn_radius ) . '</code></p></div>';
	} catch ( \Exception $e ) {
		echo '<div class="notice notice-error"><p>Failed to fetch store style.</p></div>';
	}
}

$pc  = $detected['primaryColor'] ?? $ws['primaryColor'] ?? '#4f46e5';
$sc  = $ws['starColor'] ?? '#f59e0b';
$bgc = $ws['backgroundColor'] ?? '#ffffff';
$brc = $ws['borderColor'] ?? '#e5e7eb';
$lay = $ws['layout'] ?? 'list';

$presets = array(
	array( 'name' => 'Indigo',   'p' => '#4f46e5', 's' => '#f59e0b', 'bg' => '#ffffff', 'br' => '#e5e7eb' ),
	array( 'name' => 'Shopify',  'p' => '#008060', 's' => '#f59e0b', 'bg' => '#ffffff', 'br' => '#e5e7eb' ),
	array( 'name' => 'Minimal',  'p' => '#111827', 's' => '#111827', 'bg' => '#ffffff', 'br' => '#f3f4f6' ),
	array( 'name' => 'Warm',     'p' => '#ea580c', 's' => '#f59e0b', 'bg' => '#fffbeb', 'br' => '#fde68a' ),
	array( 'name' => 'Rose',     'p' => '#e11d48', 's' => '#f59e0b', 'bg' => '#fff1f2', 'br' => '#fecdd3' ),
	array( 'name' => 'Dark',     'p' => '#f8fafc', 's' => '#f59e0b', 'bg' => '#0f172a', 'br' => '#334155' ),
);

$languages = array( '' => 'English (default)', 'no' => 'Norwegian', 'sv' => 'Swedish', 'da' => 'Danish', 'de' => 'German', 'fr' => 'French', 'es' => 'Spanish', 'nl' => 'Dutch', 'it' => 'Italian', 'pt' => 'Portuguese', 'fi' => 'Finnish', 'pl' => 'Polish', 'ja' => 'Japanese', 'zh-CN' => 'Chinese' );
?>
<div class="wrap ax-wrap">
	<h1>Review Widget Settings</h1>
	<a href="<?php echo esc_url( admin_url( 'admin.php?page=attribix-reviews' ) ); ?>" style="color:#6b7280;font-size:13px;">← Back to Reviews</a>

	<div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-top:20px;">
		<!-- Settings Column -->
		<form method="post">
			<?php wp_nonce_field( 'attribix_review_settings', '_rs_nonce' ); ?>
			<input type="hidden" name="review_settings_save" value="1" />

			<!-- Fetch Store Style -->
			<div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:16px;margin-bottom:20px;">
				<div style="display:flex;align-items:center;justify-content:space-between;">
					<div>
						<strong style="font-size:14px;">Auto-detect store style</strong>
						<p style="font-size:12px;color:#6b7280;margin:2px 0 0;">Match the widget to your theme's colors and button style.</p>
					</div>
					<button type="submit" name="fetch_style" value="1" class="button button-primary">Fetch Style</button>
				</div>
				<?php if ( $detected ) : ?>
					<div style="margin-top:10px;padding:8px 12px;background:#fff;border-radius:6px;font-size:12px;">
						Detected: <span style="display:inline-block;width:14px;height:14px;border-radius:3px;background:<?php echo esc_attr( $detected['primaryColor'] ); ?>;vertical-align:middle;"></span>
						<code><?php echo esc_html( $detected['primaryColor'] ); ?></code> · Radius: <code><?php echo esc_html( $detected['borderRadius'] ); ?></code>
					</div>
				<?php endif; ?>
			</div>

			<!-- Color Presets -->
			<h3 style="margin:0 0 8px;">Color Presets</h3>
			<div style="display:flex;gap:6px;margin-bottom:16px;flex-wrap:wrap;">
				<?php foreach ( $presets as $p ) : ?>
					<button type="button" style="padding:6px 12px;border:1px solid #d1d5db;border-radius:6px;background:#fff;cursor:pointer;font-size:12px;"
						onclick="setColors('<?php echo $p['p']; ?>','<?php echo $p['s']; ?>','<?php echo $p['bg']; ?>','<?php echo $p['br']; ?>')">
						<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:<?php echo $p['p']; ?>;vertical-align:middle;margin-right:3px;"></span>
						<?php echo esc_html( $p['name'] ); ?>
					</button>
				<?php endforeach; ?>
			</div>

			<table class="form-table" style="margin:0;">
				<tr><th>Primary Color</th><td><input type="color" name="primaryColor" id="f-pc" value="<?php echo esc_attr( $pc ); ?>" onchange="updatePreview()" /></td></tr>
				<tr><th>Star Color</th><td><input type="color" name="starColor" id="f-sc" value="<?php echo esc_attr( $sc ); ?>" onchange="updatePreview()" /></td></tr>
				<tr><th>Background</th><td><input type="color" name="backgroundColor" id="f-bgc" value="<?php echo esc_attr( $bgc ); ?>" onchange="updatePreview()" /></td></tr>
				<tr><th>Border Color</th><td><input type="color" name="borderColor" id="f-brc" value="<?php echo esc_attr( $brc ); ?>" onchange="updatePreview()" /></td></tr>
				<tr><th>Layout</th><td>
					<select name="layout" id="f-layout" onchange="updatePreview()">
						<option value="list" <?php selected( $lay, 'list' ); ?>>List</option>
						<option value="grid" <?php selected( $lay, 'grid' ); ?>>Grid</option>
						<option value="carousel" <?php selected( $lay, 'carousel' ); ?>>Carousel</option>
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

		<!-- Live Preview Column -->
		<div>
			<h3 style="margin:0 0 12px;">Live Preview</h3>
			<div id="preview-container" style="border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;">
				<div id="preview-widget" style="padding:20px;background:<?php echo esc_attr( $bgc ); ?>;transition:all 0.3s;">

					<!-- Header -->
					<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
						<div>
							<h3 style="margin:0;font-size:18px;">Customer Reviews</h3>
							<div style="margin-top:4px;">
								<span id="preview-stars" style="color:<?php echo esc_attr( $sc ); ?>;font-size:18px;">★★★★★</span>
								<span style="color:#6b7280;font-size:13px;margin-left:4px;">4.8 out of 5 (12 reviews)</span>
							</div>
						</div>
						<button style="background:<?php echo esc_attr( $pc ); ?>;color:#fff;border:none;border-radius:6px;padding:8px 16px;font-size:13px;font-weight:600;cursor:pointer;" id="preview-btn">Write a Review</button>
					</div>

					<!-- Review 1 -->
					<div id="preview-review-1" style="border:1px solid <?php echo esc_attr( $brc ); ?>;border-radius:8px;padding:14px;margin-bottom:10px;background:<?php echo esc_attr( $bgc ); ?>;">
						<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
							<span id="preview-stars-1" style="color:<?php echo esc_attr( $sc ); ?>;">★★★★★</span>
							<span style="font-weight:600;font-size:13px;" id="preview-name-1">Sarah M.</span>
							<span style="background:<?php echo esc_attr( $pc ); ?>;color:#fff;font-size:10px;padding:2px 6px;border-radius:10px;" id="preview-badge-1">✓ Verified</span>
							<span style="color:#9ca3af;font-size:11px;margin-left:auto;" id="preview-date-1">Apr 10, 2026</span>
						</div>
						<p style="margin:0;font-size:13px;color:#374151;">Absolutely love this product! The quality exceeded my expectations. Fast shipping too.</p>
					</div>

					<!-- Review 2 -->
					<div id="preview-review-2" style="border:1px solid <?php echo esc_attr( $brc ); ?>;border-radius:8px;padding:14px;margin-bottom:10px;background:<?php echo esc_attr( $bgc ); ?>;">
						<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
							<span id="preview-stars-2" style="color:<?php echo esc_attr( $sc ); ?>;">★★★★☆</span>
							<span style="font-weight:600;font-size:13px;" id="preview-name-2">Mike T.</span>
							<span style="background:<?php echo esc_attr( $pc ); ?>;color:#fff;font-size:10px;padding:2px 6px;border-radius:10px;" id="preview-badge-2">✓ Verified</span>
							<span style="color:#9ca3af;font-size:11px;margin-left:auto;" id="preview-date-2">Apr 8, 2026</span>
						</div>
						<p style="margin:0;font-size:13px;color:#374151;">Great product, would recommend. The only reason for 4 stars is the packaging could be better.</p>
					</div>
				</div>
			</div>

			<!-- Phone Preview -->
			<h3 style="margin:20px 0 12px;">Mobile Preview</h3>
			<div style="width:375px;border:2px solid #e5e7eb;border-radius:20px;overflow:hidden;padding:12px;background:#f9fafb;">
				<div id="preview-mobile" style="transform:scale(0.85);transform-origin:top left;"></div>
			</div>
		</div>
	</div>
</div>

<script>
function setColors(pc, sc, bgc, brc) {
	document.getElementById('f-pc').value = pc;
	document.getElementById('f-sc').value = sc;
	document.getElementById('f-bgc').value = bgc;
	document.getElementById('f-brc').value = brc;
	updatePreview();
}

function updatePreview() {
	var pc = document.getElementById('f-pc').value;
	var sc = document.getElementById('f-sc').value;
	var bgc = document.getElementById('f-bgc').value;
	var brc = document.getElementById('f-brc').value;

	var widget = document.getElementById('preview-widget');
	widget.style.background = bgc;

	document.getElementById('preview-btn').style.background = pc;
	document.getElementById('preview-stars').style.color = sc;
	document.getElementById('preview-stars-1').style.color = sc;
	document.getElementById('preview-stars-2').style.color = sc;
	document.getElementById('preview-badge-1').style.background = pc;
	document.getElementById('preview-badge-2').style.background = pc;

	['preview-review-1', 'preview-review-2'].forEach(function(id) {
		var el = document.getElementById(id);
		el.style.borderColor = brc;
		el.style.background = bgc;
	});

	// Update mobile preview
	var mobile = document.getElementById('preview-mobile');
	mobile.innerHTML = widget.innerHTML;
}
</script>
