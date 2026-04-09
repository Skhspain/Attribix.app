<?php
/**
 * Admin Page: UTM Builder — Generate UTM-tagged URLs.
 */
if ( ! defined( 'ABSPATH' ) ) exit;
?>
<div class="wrap ax-wrap">
	<h1 style="display:flex;align-items:center;gap:10px;">
		<span style="font-size:24px;">🔗</span> UTM Builder
	</h1>

	<div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-top:20px;">
		<!-- Builder Form -->
		<div style="background:#fff;border:1px solid #e5e7eb;border-radius:8px;padding:20px;">
			<h3 style="margin:0 0 16px;">Build Your URL</h3>
			<table class="form-table" style="margin:0;" id="ax-utm-form">
				<tr>
					<th><label>Website URL *</label></th>
					<td><input type="url" id="ax-utm-url" class="regular-text" placeholder="https://yourstore.com" value="<?php echo esc_attr( home_url() ); ?>" style="width:100%;" /></td>
				</tr>
				<tr>
					<th><label>Source *</label></th>
					<td>
						<input type="text" id="ax-utm-source" class="regular-text" placeholder="e.g. facebook, google, newsletter" style="width:100%;" />
						<div style="margin-top:6px;display:flex;gap:4px;flex-wrap:wrap;">
							<?php foreach ( array( 'facebook', 'google', 'instagram', 'tiktok', 'email', 'twitter' ) as $preset ) : ?>
								<button type="button" class="ax-btn" style="padding:2px 8px;font-size:11px;" onclick="document.getElementById('ax-utm-source').value='<?php echo $preset; ?>';buildUrl();"><?php echo $preset; ?></button>
							<?php endforeach; ?>
						</div>
					</td>
				</tr>
				<tr>
					<th><label>Medium *</label></th>
					<td>
						<input type="text" id="ax-utm-medium" class="regular-text" placeholder="e.g. cpc, email, social" style="width:100%;" />
						<div style="margin-top:6px;display:flex;gap:4px;flex-wrap:wrap;">
							<?php foreach ( array( 'cpc', 'cpm', 'email', 'social', 'organic', 'referral', 'affiliate' ) as $preset ) : ?>
								<button type="button" class="ax-btn" style="padding:2px 8px;font-size:11px;" onclick="document.getElementById('ax-utm-medium').value='<?php echo $preset; ?>';buildUrl();"><?php echo $preset; ?></button>
							<?php endforeach; ?>
						</div>
					</td>
				</tr>
				<tr>
					<th><label>Campaign</label></th>
					<td><input type="text" id="ax-utm-campaign" class="regular-text" placeholder="e.g. spring_sale, launch_2026" style="width:100%;" /></td>
				</tr>
				<tr>
					<th><label>Content</label></th>
					<td><input type="text" id="ax-utm-content" class="regular-text" placeholder="e.g. banner_top, cta_button" style="width:100%;" /></td>
				</tr>
				<tr>
					<th><label>Term</label></th>
					<td><input type="text" id="ax-utm-term" class="regular-text" placeholder="e.g. running+shoes" style="width:100%;" /></td>
				</tr>
			</table>
		</div>

		<!-- Generated URL -->
		<div>
			<div style="background:#fff;border:1px solid #e5e7eb;border-radius:8px;padding:20px;">
				<h3 style="margin:0 0 12px;">Generated URL</h3>
				<textarea id="ax-utm-result" readonly style="width:100%;height:120px;font-family:monospace;font-size:13px;padding:12px;border:1px solid #d1d5db;border-radius:6px;background:#f9fafb;resize:vertical;"></textarea>
				<div style="margin-top:12px;display:flex;gap:8px;">
					<button type="button" class="ax-btn ax-btn-primary" onclick="copyUrl()">📋 Copy URL</button>
					<button type="button" class="ax-btn" onclick="clearForm()">Clear</button>
				</div>
				<p id="ax-utm-copied" style="display:none;color:#16a34a;font-size:13px;margin-top:8px;">✓ Copied to clipboard!</p>
			</div>

			<!-- Presets -->
			<div style="background:#fff;border:1px solid #e5e7eb;border-radius:8px;padding:20px;margin-top:16px;">
				<h3 style="margin:0 0 12px;">Quick Presets</h3>
				<?php
				$presets = array(
					array( 'name' => 'Facebook CPC Ad', 'source' => 'facebook', 'medium' => 'cpc', 'campaign' => '' ),
					array( 'name' => 'Instagram Story', 'source' => 'instagram', 'medium' => 'social', 'campaign' => '' ),
					array( 'name' => 'Google Search Ad', 'source' => 'google', 'medium' => 'cpc', 'campaign' => '' ),
					array( 'name' => 'TikTok Ad', 'source' => 'tiktok', 'medium' => 'cpc', 'campaign' => '' ),
					array( 'name' => 'Email Newsletter', 'source' => 'newsletter', 'medium' => 'email', 'campaign' => '' ),
					array( 'name' => 'Influencer Link', 'source' => 'influencer', 'medium' => 'referral', 'campaign' => '' ),
				);
				foreach ( $presets as $p ) :
				?>
					<button type="button" class="ax-btn" style="margin:4px 4px 4px 0;" onclick="applyPreset('<?php echo esc_js( $p['source'] ); ?>','<?php echo esc_js( $p['medium'] ); ?>','<?php echo esc_js( $p['campaign'] ); ?>')">
						<?php echo esc_html( $p['name'] ); ?>
					</button>
				<?php endforeach; ?>
			</div>
		</div>
	</div>
</div>

<script>
function buildUrl() {
	var base = document.getElementById('ax-utm-url').value.trim();
	if (!base) return;
	var params = {};
	['source','medium','campaign','content','term'].forEach(function(k) {
		var v = document.getElementById('ax-utm-' + k).value.trim();
		if (v) params['utm_' + k] = v;
	});
	var qs = Object.keys(params).map(function(k) { return k + '=' + encodeURIComponent(params[k]); }).join('&');
	document.getElementById('ax-utm-result').value = qs ? base + (base.indexOf('?') > -1 ? '&' : '?') + qs : base;
}
function copyUrl() {
	var el = document.getElementById('ax-utm-result');
	el.select();
	document.execCommand('copy');
	var msg = document.getElementById('ax-utm-copied');
	msg.style.display = 'block';
	setTimeout(function() { msg.style.display = 'none'; }, 2000);
}
function clearForm() {
	['url','source','medium','campaign','content','term'].forEach(function(k) {
		document.getElementById('ax-utm-' + k).value = k === 'url' ? '<?php echo esc_js( home_url() ); ?>' : '';
	});
	document.getElementById('ax-utm-result').value = '';
}
function applyPreset(source, medium, campaign) {
	document.getElementById('ax-utm-source').value = source;
	document.getElementById('ax-utm-medium').value = medium;
	document.getElementById('ax-utm-campaign').value = campaign;
	buildUrl();
}
// Auto-build on input
document.querySelectorAll('#ax-utm-form input').forEach(function(el) { el.addEventListener('input', buildUrl); });
</script>
