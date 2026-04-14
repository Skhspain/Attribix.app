<?php
/**
 * Admin Page: Newsletter Editor — Create/edit newsletters with Unlayer drag-and-drop editor.
 */
if ( ! defined( 'ABSPATH' ) ) exit;

use Attribix_Woo\Api;
use Attribix_Woo\Settings;

$settings = Settings::get();
$shop     = Api::shop_domain();
$campaign_id = isset( $_GET['id'] ) ? sanitize_text_field( $_GET['id'] ) : '';
$is_new   = empty( $campaign_id );

// Load existing campaign if editing
$campaign = null;
if ( ! $is_new ) {
	$result = Api::get( '/api/standalone/newsletter/campaign/' . $campaign_id );
	$campaign = $result['campaign'] ?? null;
}

// Handle save
if ( isset( $_POST['newsletter_save'] ) && wp_verify_nonce( $_POST['_nl_nonce'] ?? '', 'attribix_newsletter_save' ) ) {
	$save_data = array(
		'action'      => $is_new ? 'create-campaign' : 'update-campaign',
		'id'          => $campaign_id ?: null,
		'name'        => sanitize_text_field( $_POST['name'] ?? '' ),
		'subject'     => sanitize_text_field( $_POST['subject'] ?? '' ),
		'htmlContent' => wp_kses_post( $_POST['htmlContent'] ?? '' ),
		'designJson'  => $_POST['designJson'] ?? null,
		'shop'        => $shop,
	);
	$result = Api::post( '/api/standalone/newsletter/update', $save_data );
	if ( ! empty( $result['ok'] ) ) {
		if ( $is_new && ! empty( $result['campaign']['id'] ) ) {
			$campaign_id = $result['campaign']['id'];
			$is_new = false;
		}
		echo '<div class="notice notice-success"><p>Newsletter saved.</p></div>';
		// Reload campaign data
		$r = Api::get( '/api/standalone/newsletter/campaign/' . $campaign_id );
		$campaign = $r['campaign'] ?? $campaign;
	} else {
		echo '<div class="notice notice-error"><p>Save failed: ' . esc_html( $result['error'] ?? 'Unknown error' ) . '</p></div>';
	}
}

// Handle send
if ( isset( $_POST['newsletter_send'] ) && wp_verify_nonce( $_POST['_nl_nonce'] ?? '', 'attribix_newsletter_save' ) ) {
	$send_result = Api::post( '/api/standalone/newsletter/update', array(
		'action' => 'update-campaign',
		'id'     => $campaign_id,
		'status' => 'sending',
		'shop'   => $shop,
	) );
	if ( ! empty( $send_result['ok'] ) ) {
		echo '<div class="notice notice-success"><p>Newsletter is being sent!</p></div>';
	} else {
		echo '<div class="notice notice-error"><p>Send failed: ' . esc_html( $send_result['error'] ?? 'Unknown error' ) . '</p></div>';
	}
}

$name    = $campaign['name'] ?? 'Untitled newsletter';
$subject = $campaign['subject'] ?? '';
$design  = $campaign['designJson'] ?? '';
$html    = $campaign['htmlContent'] ?? '';
$status  = $campaign['status'] ?? 'draft';
?>
<div class="wrap" style="max-width:100%;">
	<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
		<div>
			<h1 style="margin:0;"><?php echo $is_new ? 'New Newsletter' : 'Edit Newsletter'; ?></h1>
			<a href="<?php echo esc_url( admin_url( 'admin.php?page=attribix-newsletter' ) ); ?>" style="color:#6b7280;font-size:13px;">← Back to Newsletters</a>
		</div>
		<div style="display:flex;gap:8px;">
			<button type="button" class="button button-primary" onclick="saveNewsletter()">Save Draft</button>
			<?php if ( ! $is_new && $status === 'draft' ) : ?>
				<button type="button" class="button" style="background:#16a34a;color:#fff;border-color:#16a34a;" onclick="sendNewsletter()">Send Newsletter</button>
			<?php endif; ?>
		</div>
	</div>

	<form method="post" id="nl-form">
		<?php wp_nonce_field( 'attribix_newsletter_save', '_nl_nonce' ); ?>
		<input type="hidden" name="newsletter_save" value="1" />
		<input type="hidden" name="htmlContent" id="nl-html" value="" />
		<input type="hidden" name="designJson" id="nl-design" value="" />

		<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px;">
			<div>
				<label style="display:block;font-weight:600;font-size:13px;margin-bottom:4px;">Newsletter Name</label>
				<input type="text" name="name" value="<?php echo esc_attr( $name ); ?>" class="regular-text" style="width:100%;" />
			</div>
			<div>
				<label style="display:block;font-weight:600;font-size:13px;margin-bottom:4px;">Subject Line</label>
				<input type="text" name="subject" value="<?php echo esc_attr( $subject ); ?>" class="regular-text" style="width:100%;" placeholder="Your email subject..." />
			</div>
		</div>
	</form>

	<!-- Send form (separate to avoid confusion) -->
	<form method="post" id="nl-send-form" style="display:none;">
		<?php wp_nonce_field( 'attribix_newsletter_save', '_nl_nonce' ); ?>
		<input type="hidden" name="newsletter_send" value="1" />
	</form>

	<!-- Unlayer Editor -->
	<div id="unlayer-editor" style="height:600px;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;"></div>

	<script src="https://editor.unlayer.com/embed.js"></script>
	<script>
	unlayer.init({
		id: 'unlayer-editor',
		projectId: 1234,
		displayMode: 'email',
		appearance: { theme: 'modern_light' },
		features: { preview: true, textEditor: { tables: true } },
	});

	<?php if ( $design ) : ?>
		try {
			var designData = <?php echo $design; ?>;
			unlayer.loadDesign(typeof designData === 'string' ? JSON.parse(designData) : designData);
		} catch(e) {
			console.error('Failed to load design:', e);
		}
	<?php elseif ( $html ) : ?>
		unlayer.loadDesign({ html: <?php echo wp_json_encode( $html ); ?>, classic: true });
	<?php endif; ?>

	function saveNewsletter() {
		unlayer.exportHtml(function(data) {
			document.getElementById('nl-html').value = data.html;
			document.getElementById('nl-design').value = JSON.stringify(data.design);
			document.getElementById('nl-form').submit();
		});
	}

	function sendNewsletter() {
		if (!confirm('Send this newsletter to all subscribers? This cannot be undone.')) return;
		// Save first, then send
		unlayer.exportHtml(function(data) {
			document.getElementById('nl-html').value = data.html;
			document.getElementById('nl-design').value = JSON.stringify(data.design);
			// Save
			var form = document.getElementById('nl-form');
			form.submit();
			// After save redirect triggers send
			setTimeout(function() {
				document.getElementById('nl-send-form').submit();
			}, 1000);
		});
	}
	</script>
</div>
