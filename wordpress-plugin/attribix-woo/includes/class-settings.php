<?php
namespace Attribix_Woo;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class Settings {

	const SLUG = 'attribix-woo';

	public static function init() {
		add_action( 'admin_menu', array( __CLASS__, 'menu' ) );
		add_action( 'admin_init', array( __CLASS__, 'register' ) );
	}

	public static function get() {
		$defaults = array(
			'account_id'       => '',
			'api_key'          => '',
			'endpoint'         => ATTRIBIX_WOO_DEFAULT_ENDPOINT,
			'enabled'          => 1,
			// Pixels
			'fb_pixel_id'      => '',
			'ga4_id'           => '',
			'tt_pixel_id'      => '',
			// Reviews
			'reviews_enabled'  => 0,
			// Newsletter
			'newsletter_title' => 'Subscribe to our newsletter',
			'newsletter_btn'   => 'Subscribe',
		);
		$opts = get_option( ATTRIBIX_WOO_OPTION, array() );
		if ( ! is_array( $opts ) ) $opts = array();
		return array_merge( $defaults, $opts );
	}

	public static function menu() {
		// Main menu registered here; submenus added by Admin_Pages class
		add_menu_page(
			__( 'Attribix', 'attribix-woo' ),
			__( 'Attribix', 'attribix-woo' ),
			'manage_options',
			self::SLUG,
			'__return_false',
			'dashicons-chart-area',
			58
		);
	}

	public static function register() {
		register_setting( self::SLUG, ATTRIBIX_WOO_OPTION, array(
			'type'              => 'array',
			'sanitize_callback' => array( __CLASS__, 'sanitize' ),
			'default'           => self::get(),
		) );
	}

	public static function sanitize( $input ) {
		$out = self::get();
		if ( isset( $input['account_id'] ) )      $out['account_id']       = sanitize_text_field( $input['account_id'] );
		if ( isset( $input['api_key'] ) )          $out['api_key']          = sanitize_text_field( $input['api_key'] );
		if ( isset( $input['endpoint'] ) )         $out['endpoint']         = esc_url_raw( trim( $input['endpoint'] ) ) ?: ATTRIBIX_WOO_DEFAULT_ENDPOINT;
		$out['enabled']          = ! empty( $input['enabled'] ) ? 1 : 0;
		if ( isset( $input['fb_pixel_id'] ) )      $out['fb_pixel_id']      = sanitize_text_field( $input['fb_pixel_id'] );
		if ( isset( $input['ga4_id'] ) )           $out['ga4_id']           = sanitize_text_field( $input['ga4_id'] );
		if ( isset( $input['tt_pixel_id'] ) )      $out['tt_pixel_id']      = sanitize_text_field( $input['tt_pixel_id'] );
		$out['reviews_enabled']  = ! empty( $input['reviews_enabled'] ) ? 1 : 0;
		if ( isset( $input['newsletter_title'] ) ) $out['newsletter_title'] = sanitize_text_field( $input['newsletter_title'] );
		if ( isset( $input['newsletter_btn'] ) )   $out['newsletter_btn']   = sanitize_text_field( $input['newsletter_btn'] );
		return $out;
	}

	public static function render() {
		if ( ! current_user_can( 'manage_options' ) ) return;

		$opts = self::get();
		$tab  = isset( $_GET['tab'] ) ? sanitize_key( $_GET['tab'] ) : 'general';
		$tabs = array(
			'general'      => 'General',
			'tracking'     => 'Tracking Pixels',
			'newsletter'   => 'Newsletter',
			'reviews'      => 'Reviews',
			'integrations' => 'Integrations',
		);
		?>
		<div class="wrap">
			<h1 style="display:flex;align-items:center;gap:12px;">
				<span style="font-size:28px;">📊</span> Attribix for WooCommerce
				<a href="https://attribix.app/analytics" target="_blank" class="button button-primary" style="margin-left:auto;">
					Open Dashboard →
				</a>
			</h1>

			<nav class="nav-tab-wrapper" style="margin-top:12px;">
				<?php foreach ( $tabs as $key => $label ) : ?>
					<a href="<?php echo esc_url( admin_url( 'admin.php?page=' . self::SLUG . '-settings&tab=' . $key ) ); ?>"
					   class="nav-tab <?php echo $tab === $key ? 'nav-tab-active' : ''; ?>">
						<?php echo esc_html( $label ); ?>
					</a>
				<?php endforeach; ?>
			</nav>

			<form method="post" action="options.php" style="max-width:700px;margin-top:20px;">
				<?php settings_fields( self::SLUG ); ?>

				<?php if ( $tab === 'general' ) : ?>
					<?php $is_connected = \Attribix_Woo\Setup::is_connected(); ?>

					<!-- Connection Status -->
					<div style="background:<?php echo $is_connected ? '#ecfdf5' : '#eff6ff'; ?>;border:1px solid <?php echo $is_connected ? '#bbf7d0' : '#bfdbfe'; ?>;border-radius:10px;padding:24px;margin-bottom:24px;">
						<?php if ( $is_connected ) : ?>
							<div style="display:flex;align-items:center;gap:12px;margin-bottom:20px;">
								<span style="font-size:36px;">✅</span>
								<div>
									<h3 style="margin:0;color:#065f46;">Store Connected</h3>
									<p style="margin:4px 0 0;color:#6b7280;font-size:13px;">
										Your store <strong><?php echo esc_html( \Attribix_Woo\Api::shop_domain() ); ?></strong> is collecting analytics data.
									</p>
								</div>
							</div>

							<!-- Next Steps Checklist -->
							<div style="background:#fff;border:1px solid #d1d5db;border-radius:10px;padding:20px;margin-top:16px;">
								<h4 style="margin:0 0 4px;font-size:15px;">🎯 Next Steps</h4>
								<p style="margin:0 0 16px;font-size:13px;color:#6b7280;">Complete these to get the most out of Attribix:</p>

								<?php
								// Fetch live integration status from the API
								$status = \Attribix_Woo\Api::get( '/api/woo/status', array( 'shop' => \Attribix_Woo\Api::shop_domain() ) );

								$meta_connected   = $status['meta']['connected'] ?? false;
								$google_connected = $status['google']['connected'] ?? false;
								$auto_fb_pixel    = $status['pixels']['fbPixelId'] ?? '';

								// Sync auto-detected pixel into local settings
								if ( $auto_fb_pixel && empty( $opts['fb_pixel_id'] ) ) {
									$opts['fb_pixel_id'] = $auto_fb_pixel;
									update_option( ATTRIBIX_WOO_OPTION, $opts );
								}

								$has_fb_pixel  = ! empty( $opts['fb_pixel_id'] ) || ! empty( $auto_fb_pixel );
								$has_ga4       = ! empty( $opts['ga4_id'] );
								$has_reviews   = ! empty( $opts['reviews_enabled'] );
								$meta_oauth    = 'https://attribix.app/api/meta/oauth/start?shop=' . urlencode( \Attribix_Woo\Api::shop_domain() ) . '&platform=woocommerce';
								$google_oauth  = 'https://attribix-app.fly.dev/api/google/oauth/start?shop=' . urlencode( \Attribix_Woo\Api::shop_domain() ) . '&platform=woocommerce';

								// Check if newsletter shortcode exists on any published page/post
								global $wpdb;
								$has_newsletter_widget = (bool) $wpdb->get_var(
									"SELECT COUNT(*) FROM {$wpdb->posts} WHERE post_status='publish' AND post_content LIKE '%[attribix_newsletter%'"
								);

								$steps = array(
									array(
										'done'   => true,
										'title'  => 'Event tracking installed',
										'desc'   => 'Page views, product views, and orders are being tracked.',
										'action' => '',
									),
									array(
										'done'   => $meta_connected,
										'title'  => 'Connect Meta Ads',
										'desc'   => $meta_connected ? 'Meta Ads is connected. Ad data is syncing.' : 'See Facebook & Instagram ad performance and ROAS.',
										'action' => $meta_connected
											? '<div style="display:flex;gap:6px;"><a href="' . esc_url( admin_url( 'admin.php?page=attribix-meta-ads' ) ) . '" class="button">View →</a><button type="button" class="button" onclick="window.open(\'' . esc_js( $meta_oauth ) . '\', \'meta\', \'width=900,height=800\')">Reconnect</button></div>'
											: '<button type="button" class="button button-primary" onclick="window.open(\'' . esc_js( $meta_oauth ) . '\', \'meta\', \'width=900,height=800\')">Connect Meta →</button>',
									),
									array(
										'done'   => $google_connected,
										'title'  => 'Connect Google Ads',
										'desc'   => $google_connected ? 'Google Ads is connected. Ad data is syncing.' : 'Track your Google Ads campaigns and conversions.',
										'action' => $google_connected
											? '<div style="display:flex;gap:6px;"><a href="' . esc_url( admin_url( 'admin.php?page=attribix-google-ads' ) ) . '" class="button">View →</a><button type="button" class="button" onclick="window.open(\'' . esc_js( $google_oauth ) . '\', \'google\', \'width=900,height=800\')">Reconnect</button></div>'
											: '<button type="button" class="button button-primary" onclick="window.open(\'' . esc_js( $google_oauth ) . '\', \'google\', \'width=900,height=800\')">Connect Google →</button>',
									),
									array(
										'done'   => $has_fb_pixel || $has_ga4,
										'title'  => 'Add tracking pixels',
										'desc'   => $auto_fb_pixel
											? 'Meta Pixel auto-detected: ' . esc_html( $auto_fb_pixel )
											: 'Enable Meta Pixel, GA4, or TikTok Pixel to fire ecommerce events.',
										'action' => '<a href="' . esc_url( admin_url( 'admin.php?page=attribix-woo-settings&tab=tracking' ) ) . '" class="button">' . ( ( $has_fb_pixel || $has_ga4 ) ? 'Manage pixels →' : 'Set up pixels →' ) . '</a>',
									),
									array(
										'done'   => $has_reviews,
										'title'  => 'Enable product reviews',
										'desc'   => $has_reviews ? 'Product reviews widget is active on your product pages.' : 'Show star ratings and reviews on your product pages.',
										'action' => '<a href="' . esc_url( admin_url( 'admin.php?page=attribix-woo-settings&tab=reviews' ) ) . '" class="button">' . ( $has_reviews ? 'Manage reviews →' : 'Enable reviews →' ) . '</a>',
									),
									array(
										'done'   => $has_newsletter_widget,
										'title'  => 'Add newsletter signup',
										'desc'   => $has_newsletter_widget ? 'Newsletter signup form is live on your site.' : 'Place a signup form on your site using <code>[attribix_newsletter]</code>.',
										'action' => '<a href="' . esc_url( admin_url( 'admin.php?page=attribix-woo-settings&tab=newsletter' ) ) . '" class="button">' . ( $has_newsletter_widget ? 'Manage →' : 'Get shortcode →' ) . '</a>',
									),
								);
								?>

								<div style="display:flex;flex-direction:column;gap:12px;">
									<?php foreach ( $steps as $step ) : ?>
										<div style="display:flex;align-items:center;gap:14px;padding:12px;border:1px solid <?php echo $step['done'] ? '#bbf7d0' : '#e5e7eb'; ?>;border-radius:8px;background:<?php echo $step['done'] ? '#f0fdf4' : '#fff'; ?>;">
											<div style="width:28px;height:28px;border-radius:50%;background:<?php echo $step['done'] ? '#16a34a' : '#e5e7eb'; ?>;color:<?php echo $step['done'] ? '#fff' : '#9ca3af'; ?>;display:flex;align-items:center;justify-content:center;font-weight:700;flex-shrink:0;">
												<?php echo $step['done'] ? '✓' : '○'; ?>
											</div>
											<div style="flex:1;">
												<div style="font-weight:600;font-size:14px;color:<?php echo $step['done'] ? '#065f46' : '#111827'; ?>;"><?php echo esc_html( $step['title'] ); ?></div>
												<div style="font-size:12px;color:#6b7280;margin-top:2px;"><?php echo wp_kses_post( $step['desc'] ); ?></div>
											</div>
											<?php if ( ! empty( $step['action'] ) ) : ?>
												<div style="flex-shrink:0;"><?php echo $step['action']; ?></div>
											<?php endif; ?>
										</div>
									<?php endforeach; ?>
								</div>

								<div style="margin-top:20px;padding-top:16px;border-top:1px solid #e5e7eb;text-align:center;">
									<a href="<?php echo esc_url( admin_url( 'admin.php?page=attribix-woo' ) ); ?>" class="button button-primary">Go to Dashboard →</a>
								</div>
							</div>
						<?php else : ?>
							<div style="display:flex;align-items:center;gap:16px;">
								<span style="font-size:40px;">🚀</span>
								<div style="flex:1;">
									<h3 style="margin:0;color:#1e40af;">Connect Your Store</h3>
									<p style="margin:6px 0 12px;color:#6b7280;font-size:14px;">
										One click to connect your WooCommerce store to Attribix. This will automatically set up analytics tracking, enable all dashboard features, and start collecting data.
									</p>
									<button type="button" id="attribix-connect-btn" class="button button-primary button-hero" style="font-size:16px;">
										Connect to Attribix →
									</button>
									<div id="attribix-connect-status" style="margin-top:10px;display:none;"></div>
								</div>
							</div>
							<script>
							document.getElementById('attribix-connect-btn').addEventListener('click', function() {
								var btn = this;
								var status = document.getElementById('attribix-connect-status');
								btn.disabled = true;
								btn.textContent = 'Connecting...';
								status.style.display = 'block';
								status.innerHTML = '<span style="color:#6b7280;">⏳ Setting up your account...</span>';

								fetch('<?php echo esc_url( admin_url( 'admin-ajax.php' ) ); ?>', {
									method: 'POST',
									headers: {'Content-Type': 'application/x-www-form-urlencoded'},
									body: 'action=attribix_connect&nonce=<?php echo wp_create_nonce( 'attribix_connect' ); ?>'
								})
								.then(function(r) { return r.json(); })
								.then(function(data) {
									if (data.success) {
										status.innerHTML = '<span style="color:#065f46;font-weight:600;">✅ ' + (data.data.message || 'Connected!') + '</span>';
										setTimeout(function() { window.location.reload(); }, 1000);
									} else {
										status.innerHTML = '<span style="color:#dc2626;">❌ ' + (data.data || 'Connection failed.') + '</span>';
										btn.disabled = false;
										btn.textContent = 'Connect to Attribix →';
									}
								})
								.catch(function(e) {
									status.innerHTML = '<span style="color:#dc2626;">❌ Network error. Please try again.</span>';
									btn.disabled = false;
									btn.textContent = 'Connect to Attribix →';
								});
							});
							</script>
						<?php endif; ?>
					</div>

					<!-- Settings (shown always, collapsed for connected users) -->
					<table class="form-table">
						<tr>
							<th><label>Event Tracking</label></th>
							<td>
								<label><input type="checkbox" name="<?php echo esc_attr( ATTRIBIX_WOO_OPTION ); ?>[enabled]" value="1" <?php checked( 1, $opts['enabled'] ); ?> /> Enable event tracking</label>
								<p class="description">Page views, product views, cart events, and orders are sent to Attribix.</p>
							</td>
						</tr>
					</table>

					<?php if ( $is_connected ) : ?>
					<details style="margin-top:16px;">
						<summary style="cursor:pointer;color:#6b7280;font-size:13px;">Advanced settings</summary>
						<table class="form-table" style="margin-top:8px;">
							<tr>
								<th><label>Account ID</label></th>
								<td><input type="text" name="<?php echo esc_attr( ATTRIBIX_WOO_OPTION ); ?>[account_id]" value="<?php echo esc_attr( $opts['account_id'] ); ?>" class="regular-text code" readonly /></td>
							</tr>
							<tr>
								<th><label>API Key</label></th>
								<td><input type="text" name="<?php echo esc_attr( ATTRIBIX_WOO_OPTION ); ?>[api_key]" value="<?php echo esc_attr( $opts['api_key'] ); ?>" class="regular-text code" readonly /></td>
							</tr>
							<tr>
								<th><label>API Endpoint</label></th>
								<td>
									<input type="url" name="<?php echo esc_attr( ATTRIBIX_WOO_OPTION ); ?>[endpoint]" value="<?php echo esc_attr( $opts['endpoint'] ); ?>" class="regular-text code" />
									<p class="description">Leave default unless self-hosting.</p>
								</td>
							</tr>
						</table>
					</details>
					<?php else : ?>
						<input type="hidden" name="<?php echo esc_attr( ATTRIBIX_WOO_OPTION ); ?>[account_id]" value="<?php echo esc_attr( $opts['account_id'] ); ?>" />
						<input type="hidden" name="<?php echo esc_attr( ATTRIBIX_WOO_OPTION ); ?>[api_key]" value="<?php echo esc_attr( $opts['api_key'] ); ?>" />
						<input type="hidden" name="<?php echo esc_attr( ATTRIBIX_WOO_OPTION ); ?>[endpoint]" value="<?php echo esc_attr( $opts['endpoint'] ); ?>" />
					<?php endif; ?>

				<?php elseif ( $tab === 'tracking' ) : ?>
					<?php
					$meta_status = \Attribix_Woo\Api::get( '/api/woo/status', array( 'shop' => \Attribix_Woo\Api::shop_domain() ) );
					$meta_is_connected = $meta_status['meta']['connected'] ?? false;
					$current_ad_account = $meta_status['meta']['adAccountId'] ?? '';
					// Prefer backend status over local options (backend is source of truth)
					$current_pixel      = $meta_status['pixels']['fbPixelId'] ?? $opts['fb_pixel_id'] ?? '';
					// Sync backend pixel to local options
					if ( ! empty( $meta_status['pixels']['fbPixelId'] ) && $opts['fb_pixel_id'] !== $meta_status['pixels']['fbPixelId'] ) {
						$opts['fb_pixel_id'] = $meta_status['pixels']['fbPixelId'];
						update_option( ATTRIBIX_WOO_OPTION, $opts );
					}
					$meta_reconnect_url = 'https://attribix.app/api/meta/oauth/start?shop=' . urlencode( \Attribix_Woo\Api::shop_domain() ) . '&platform=woocommerce';

					// Handle manual ad account ID entry
					if ( isset( $_POST['use_manual_account'] ) && wp_verify_nonce( $_POST['_meta_nonce'] ?? '', 'attribix_meta_save' ) ) {
						$manual_id = sanitize_text_field( $_POST['manual_ad_account_id'] ?? '' );
						if ( $manual_id ) {
							// Ensure it starts with act_
							if ( strpos( $manual_id, 'act_' ) !== 0 ) {
								$manual_id = 'act_' . ltrim( $manual_id, '_' );
							}
							\Attribix_Woo\Api::post( '/api/woo/meta/select', array(
								'shop'        => \Attribix_Woo\Api::shop_domain(),
								'adAccountId' => $manual_id,
							) );
							$current_ad_account = $manual_id;
							echo '<div class="notice notice-success"><p>Ad account set to: ' . esc_html( $manual_id ) . '</p></div>';
						}
					}

					// Handle form save FIRST (before fetching so we get fresh data)
					if ( isset( $_POST['meta_pixel_save'] ) && wp_verify_nonce( $_POST['_meta_nonce'] ?? '', 'attribix_meta_save' ) ) {
						$new_account = sanitize_text_field( $_POST['ad_account_id'] ?? '' );
						$new_pixel   = sanitize_text_field( $_POST['pixel_id'] ?? '' );

						$save_result = \Attribix_Woo\Api::post( '/api/woo/meta/select', array(
							'shop'        => \Attribix_Woo\Api::shop_domain(),
							'adAccountId' => $new_account ?: null,
							'pixelId'     => $new_pixel ?: null,
						) );

						if ( ! empty( $save_result['ok'] ) ) {
							if ( $new_pixel ) {
								$opts['fb_pixel_id'] = $new_pixel;
								update_option( ATTRIBIX_WOO_OPTION, $opts );
								$current_pixel = $new_pixel;
							}
							if ( $new_account ) {
								$current_ad_account = $new_account;
							}
							// Re-fetch status to confirm save
							$meta_status = \Attribix_Woo\Api::get( '/api/woo/status', array( 'shop' => \Attribix_Woo\Api::shop_domain() ) );
							$current_ad_account = $meta_status['meta']['adAccountId'] ?? $current_ad_account;
							$current_pixel      = $meta_status['pixels']['fbPixelId'] ?? $current_pixel;

							// Also sync to local WP options
							if ( ! empty( $meta_status['pixels']['fbPixelId'] ) ) {
								$opts['fb_pixel_id'] = $meta_status['pixels']['fbPixelId'];
								update_option( ATTRIBIX_WOO_OPTION, $opts );
							}

							$saved_parts = array();
							if ( $new_account ) $saved_parts[] = 'ad account <code>' . esc_html( $new_account ) . '</code>';
							if ( $new_pixel ) $saved_parts[] = 'pixel <code>' . esc_html( $new_pixel ) . '</code>';
							echo '<div class="notice notice-success"><p>✓ Saved: ' . implode( ', ', $saved_parts ) . '</p></div>';
						} else {
							echo '<div class="notice notice-error"><p>Save failed: ' . esc_html( $save_result['error'] ?? 'Unknown error' ) . '</p></div>';
						}
					}

					// Handle create pixel
					if ( isset( $_POST['meta_pixel_create'] ) && wp_verify_nonce( $_POST['_meta_nonce'] ?? '', 'attribix_meta_save' ) ) {
						$pixel_name = sanitize_text_field( $_POST['new_pixel_name'] ?? '' );
						$create_result = \Attribix_Woo\Api::post( '/api/woo/meta/pixel-create', array(
							'shop' => \Attribix_Woo\Api::shop_domain(),
							'name' => $pixel_name ?: ( get_bloginfo( 'name' ) . ' Pixel' ),
						) );
						if ( ! empty( $create_result['ok'] ) && ! empty( $create_result['pixel']['id'] ) ) {
							$opts['fb_pixel_id'] = $create_result['pixel']['id'];
							update_option( ATTRIBIX_WOO_OPTION, $opts );
							$current_pixel = $create_result['pixel']['id'];
							echo '<div class="notice notice-success"><p>✓ New pixel created: ' . esc_html( $create_result['pixel']['id'] ) . '</p></div>';
						} else {
							echo '<div class="notice notice-error"><p>Failed to create pixel: ' . esc_html( $create_result['error'] ?? 'Unknown error' ) . '</p></div>';
						}
					}

					// Load ad accounts + pixels from WooCommerce-specific backend endpoints
					$ad_accounts = array();
					$pixels = array();
					if ( $meta_is_connected ) {
						$acct_response = \Attribix_Woo\Api::get( '/api/woo/meta/adaccounts', array( 'shop' => \Attribix_Woo\Api::shop_domain() ) );
						$ad_accounts = $acct_response['accounts'] ?? array();

						if ( $current_ad_account ) {
							$pixel_response = \Attribix_Woo\Api::get( '/api/woo/meta/pixels', array( 'shop' => \Attribix_Woo\Api::shop_domain() ) );
							$pixels = $pixel_response['pixels'] ?? array();
						}
					}
					?>

					<h2>Ad Platform Pixels</h2>
					<p class="description">Tracking pixels fire standard ecommerce events (PageView, ViewContent, AddToCart, Purchase) on your storefront.</p>

					<!-- Meta Pixel Card -->
					<div style="background:#fff;border:1px solid #e5e7eb;border-radius:10px;padding:24px;margin:20px 0;max-width:760px;">
						<div style="display:flex;align-items:center;gap:12px;margin-bottom:20px;">
							<span style="font-size:32px;">📘</span>
							<div style="flex:1;">
								<h3 style="margin:0;font-size:16px;">Meta Pixel</h3>
								<p style="margin:4px 0 0;font-size:13px;color:#6b7280;">Facebook & Instagram conversion tracking</p>
							</div>
							<?php if ( $meta_is_connected ) : ?>
								<span style="background:#16a34a;color:#fff;padding:4px 12px;border-radius:12px;font-size:11px;font-weight:600;">✓ Meta Connected</span>
							<?php else : ?>
								<span style="background:#f3f4f6;color:#6b7280;padding:4px 12px;border-radius:12px;font-size:11px;font-weight:600;">Not connected</span>
							<?php endif; ?>
						</div>

						<?php if ( ! $meta_is_connected ) : ?>
							<p style="font-size:13px;color:#6b7280;margin:0 0 12px;">Connect your Meta account to select from your ad accounts and pixels.</p>
							<button type="button" class="button button-primary" onclick="window.open('<?php echo esc_js( $meta_reconnect_url ); ?>', 'meta', 'width=900,height=800')">Connect Meta →</button>
						<?php else : ?>
							<form method="post">
								<?php wp_nonce_field( 'attribix_meta_save', '_meta_nonce' ); ?>
								<input type="hidden" name="meta_pixel_save" value="1" />

								<!-- Ad Account Picker (searchable) -->
								<div style="margin-bottom:16px;">
									<label style="display:block;font-weight:600;font-size:13px;margin-bottom:6px;">Ad Account</label>
									<?php if ( empty( $ad_accounts ) ) : ?>
										<p style="font-size:13px;color:#9ca3af;">Loading ad accounts... If this persists, try reconnecting Meta.</p>
									<?php else : ?>
										<input type="text" id="ax-adacct-search" placeholder="🔍 Type to search <?php echo count( $ad_accounts ); ?> ad accounts..." style="width:100%;max-width:500px;padding:8px 12px;font-size:13px;border:1px solid #d1d5db;border-radius:6px;margin-bottom:6px;" />
										<select name="ad_account_id" id="ax-adacct-select" onchange="this.form.submit()" style="width:100%;max-width:500px;padding:8px;font-size:13px;border:1px solid #d1d5db;border-radius:6px;">
											<option value="">— Select an ad account —</option>
											<?php foreach ( $ad_accounts as $acct ) :
												$label = ( $acct['name'] ?? $acct['id'] ) . ' (' . $acct['id'] . ')' . ( ! empty( $acct['currency'] ) ? ' — ' . $acct['currency'] : '' );
											?>
												<option value="<?php echo esc_attr( $acct['id'] ); ?>" data-label="<?php echo esc_attr( strtolower( $label ) ); ?>" <?php selected( $current_ad_account, $acct['id'] ); ?>>
													<?php echo esc_html( $label ); ?>
												</option>
											<?php endforeach; ?>
										</select>
										<p style="font-size:11px;color:#9ca3af;margin:4px 0 0;"><?php echo count( $ad_accounts ); ?> ad accounts found.</p>

										<!-- Missing accounts help -->
										<details style="margin-top:10px;font-size:12px;">
											<summary style="cursor:pointer;color:#2563eb;font-weight:500;">❓ Don't see the account you need?</summary>
											<div style="padding:14px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;margin-top:8px;">
												<p style="margin:0 0 8px;color:#374151;">Meta only shows accounts your Facebook user has <strong>explicit access</strong> to. If an account is missing:</p>
												<ol style="margin:0 0 12px 18px;padding:0;color:#374151;">
													<li style="margin-bottom:4px;">Go to <a href="https://business.facebook.com/settings/ad-accounts" target="_blank">Meta Business Settings → Ad Accounts</a></li>
													<li style="margin-bottom:4px;">Assign your user to the ad account with admin permissions</li>
													<li style="margin-bottom:4px;">Click <strong>Reconnect Meta</strong> below to refresh the list</li>
												</ol>

												<p style="margin:12px 0 6px;font-weight:600;color:#111827;">Or enter the ad account ID manually:</p>
												<div style="display:flex;gap:6px;">
													<input type="text" name="manual_ad_account_id" placeholder="act_123456789012345" style="flex:1;padding:6px 10px;font-size:12px;border:1px solid #d1d5db;border-radius:4px;" />
													<button type="submit" name="use_manual_account" value="1" class="button button-small">Use this ID</button>
												</div>
												<p style="font-size:11px;color:#9ca3af;margin:4px 0 0;">Find the ID in Meta Ads Manager → top-left account picker. It starts with <code>act_</code></p>
											</div>
										</details>
										<script>
										(function() {
											var input = document.getElementById('ax-adacct-search');
											var select = document.getElementById('ax-adacct-select');
											if (!input || !select) return;
											var originalOptions = Array.from(select.options);
											input.addEventListener('input', function() {
												var q = input.value.toLowerCase().trim();
												select.innerHTML = '';
												originalOptions.forEach(function(opt) {
													var label = opt.getAttribute('data-label') || opt.textContent.toLowerCase();
													if (!q || label.indexOf(q) > -1 || opt.value === '') {
														select.appendChild(opt.cloneNode(true));
													}
												});
											});
										})();
										</script>
									<?php endif; ?>
								</div>

								<!-- Active account indicator -->
								<?php if ( $current_ad_account ) :
									$active_name = '';
									foreach ( $ad_accounts as $a ) {
										if ( $a['id'] === $current_ad_account ) {
											$active_name = $a['name'] ?? $a['id'];
											break;
										}
									}
								?>
									<div style="padding:10px 14px;background:#ecfdf5;border:1px solid #bbf7d0;border-radius:6px;margin-bottom:14px;font-size:12px;">
										<strong>✓ Active ad account:</strong> <?php echo esc_html( $active_name ?: $current_ad_account ); ?> <code style="background:#fff;padding:1px 6px;border-radius:3px;"><?php echo esc_html( $current_ad_account ); ?></code>
										<br><span style="color:#6b7280;">Pixels shown below are those accessible to this ad account. In Meta, pixels can be shared across ad accounts.</span>
									</div>
								<?php endif; ?>

								<!-- Pixel Picker -->
								<?php if ( $current_ad_account ) : ?>
									<div style="margin-bottom:16px;">
										<label style="display:block;font-weight:600;font-size:13px;margin-bottom:6px;">Meta Pixel</label>
										<?php if ( empty( $pixels ) ) : ?>
											<div style="padding:12px;background:#fffbeb;border:1px solid #fde68a;border-radius:6px;margin-bottom:8px;">
												<p style="font-size:13px;color:#92400e;margin:0;">⚠️ No pixels found in this ad account. Create one below or in Events Manager.</p>
											</div>
										<?php else : ?>
											<select name="pixel_id" style="width:100%;max-width:500px;padding:8px;font-size:13px;border:1px solid #d1d5db;border-radius:6px;">
												<option value="">— Select a pixel —</option>
												<?php foreach ( $pixels as $px ) : ?>
													<option value="<?php echo esc_attr( $px['id'] ); ?>" <?php selected( $current_pixel, $px['id'] ); ?>>
														<?php echo esc_html( ( $px['name'] ?? 'Unnamed' ) . ' (' . $px['id'] . ')' ); ?>
													</option>
												<?php endforeach; ?>
											</select>
											<p style="font-size:11px;color:#9ca3af;margin:4px 0 8px;"><?php echo count( $pixels ); ?> pixel(s) found.</p>
											<button type="submit" class="button button-primary">Save Pixel Selection</button>
										<?php endif; ?>
									</div>

									<!-- Create New Pixel -->
									<div style="margin-top:12px;padding:12px;background:#f0f9ff;border:1px solid #bfdbfe;border-radius:6px;">
										<p style="margin:0 0 8px;font-size:13px;font-weight:600;color:#1e40af;">➕ Create a new pixel</p>
										<div style="display:flex;gap:8px;align-items:center;">
											<input type="text" name="new_pixel_name" placeholder="<?php echo esc_attr( get_bloginfo( 'name' ) . ' Pixel' ); ?>" style="flex:1;max-width:280px;padding:6px 10px;font-size:13px;border:1px solid #d1d5db;border-radius:6px;" />
											<button type="submit" name="meta_pixel_create" value="1" class="button">Create Pixel</button>
										</div>
										<p style="font-size:11px;color:#6b7280;margin:6px 0 0;">Creates a new pixel in the selected ad account and auto-activates it.</p>
									</div>
								<?php endif; ?>

								<div style="margin-top:16px;padding-top:16px;border-top:1px solid #f3f4f6;">
									<button type="button" class="button" onclick="window.open('<?php echo esc_js( $meta_reconnect_url ); ?>', 'meta', 'width=900,height=800')">Reconnect Meta</button>
									<span style="font-size:11px;color:#9ca3af;margin-left:8px;">Reconnect to refresh ad accounts & pixels list</span>
								</div>
							</form>
						<?php endif; ?>
					</div>

					<!-- Hidden field to preserve pixel ID on main settings save -->
					<input type="hidden" name="<?php echo esc_attr( ATTRIBIX_WOO_OPTION ); ?>[fb_pixel_id]" value="<?php echo esc_attr( $opts['fb_pixel_id'] ); ?>" />

					<h3 style="margin-top:32px;">Other Tracking (manual)</h3>
					<p class="description">For Google Analytics and TikTok, enter the IDs manually.</p>
					<table class="form-table"><tr style="display:none;"><th></th><td></td></tr>
						<tr>
							<th><label>Google Analytics (GA4)</label></th>
							<td>
								<input type="text" name="<?php echo esc_attr( ATTRIBIX_WOO_OPTION ); ?>[ga4_id]" value="<?php echo esc_attr( $opts['ga4_id'] ); ?>" class="regular-text" placeholder="G-XXXXXXXXXX" />
								<p class="description">GA4 Measurement ID.</p>
							</td>
						</tr>
						<tr>
							<th><label>TikTok Pixel ID</label></th>
							<td>
								<input type="text" name="<?php echo esc_attr( ATTRIBIX_WOO_OPTION ); ?>[tt_pixel_id]" value="<?php echo esc_attr( $opts['tt_pixel_id'] ); ?>" class="regular-text" placeholder="CXXXXXXXXXXXXXXXXX" />
								<p class="description">TikTok Pixel ID from <a href="https://ads.tiktok.com" target="_blank">TikTok Ads Manager</a>.</p>
							</td>
						</tr>
					</table>

				<?php elseif ( $tab === 'newsletter' ) : ?>
					<h2>Newsletter Signup Widget</h2>
					<p>Add a newsletter signup form anywhere on your site using the shortcode:</p>
					<div style="background:#f0f0f1;padding:12px 16px;border-radius:6px;font-family:monospace;margin:12px 0;font-size:14px;">
						[attribix_newsletter]
					</div>
					<p class="description">Optional attributes: <code>title="..."</code> <code>button_text="..."</code> <code>placeholder="..."</code> <code>style="minimal"</code></p>

					<table class="form-table" style="margin-top:20px;">
						<tr>
							<th><label>Default Title</label></th>
							<td><input type="text" name="<?php echo esc_attr( ATTRIBIX_WOO_OPTION ); ?>[newsletter_title]" value="<?php echo esc_attr( $opts['newsletter_title'] ); ?>" class="regular-text" /></td>
						</tr>
						<tr>
							<th><label>Button Text</label></th>
							<td><input type="text" name="<?php echo esc_attr( ATTRIBIX_WOO_OPTION ); ?>[newsletter_btn]" value="<?php echo esc_attr( $opts['newsletter_btn'] ); ?>" class="regular-text" /></td>
						</tr>
					</table>
					<p style="margin-top:16px;">Manage subscribers and send newsletters from your <a href="https://attribix.app/analytics/newsletter" target="_blank">Attribix Dashboard →</a></p>

				<?php elseif ( $tab === 'reviews' ) : ?>
					<h2>Product Reviews Widget</h2>
					<table class="form-table">
						<tr>
							<th><label>Reviews Widget</label></th>
							<td>
								<label><input type="checkbox" name="<?php echo esc_attr( ATTRIBIX_WOO_OPTION ); ?>[reviews_enabled]" value="1" <?php checked( 1, $opts['reviews_enabled'] ); ?> /> Show Attribix reviews on product pages</label>
								<p class="description">Automatically displays the review widget below the product description.</p>
							</td>
						</tr>
					</table>
					<p>You can also use the shortcode on any page:</p>
					<div style="background:#f0f0f1;padding:12px 16px;border-radius:6px;font-family:monospace;margin:12px 0;font-size:14px;">
						[attribix_reviews product_id="123"]
					</div>
					<p style="margin-top:16px;">Manage reviews, widget design, and review requests from your <a href="https://attribix.app/analytics/reviews" target="_blank">Attribix Dashboard →</a></p>

				<?php elseif ( $tab === 'integrations' ) : ?>
					<?php
					$shop_domain = \Attribix_Woo\Api::shop_domain();
					// Route OAuth through attribix.app (Vercel proxy) to avoid Chrome lookalike warnings
					$meta_oauth   = 'https://attribix.app/api/meta/oauth/start?shop=' . urlencode( $shop_domain ) . '&platform=woocommerce';
					$google_oauth = 'https://attribix-app.fly.dev/api/google/oauth/start?shop=' . urlencode( $shop_domain ) . '&platform=woocommerce';
					$tiktok_oauth = 'https://attribix.app/api/tiktok/oauth/start?shop=' . urlencode( $shop_domain ) . '&platform=woocommerce';
					?>
					<h2>Ad Platform Integrations</h2>
					<p>Connect your ad accounts to see campaign performance, ROAS, and attribution data directly in your WordPress admin.</p>

					<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:20px;max-width:600px;">
						<div style="border:1px solid #d1d5db;border-radius:8px;padding:16px;background:#fff;">
							<div style="font-size:20px;margin-bottom:4px;">📘 <strong>Meta Ads</strong></div>
							<p style="color:#6b7280;font-size:13px;margin:4px 0 12px;">Facebook & Instagram Ads</p>
							<button type="button" class="button button-primary" onclick="window.open('<?php echo esc_js( $meta_oauth ); ?>', 'meta_oauth', 'width=900,height=800')">Connect Meta →</button>
						</div>
						<div style="border:1px solid #d1d5db;border-radius:8px;padding:16px;background:#fff;">
							<div style="font-size:20px;margin-bottom:4px;">📈 <strong>Google Ads</strong></div>
							<p style="color:#6b7280;font-size:13px;margin:4px 0 12px;">Google Ads campaigns</p>
							<button type="button" class="button button-primary" onclick="window.open('<?php echo esc_js( $google_oauth ); ?>', 'google_oauth', 'width=900,height=800')">Connect Google →</button>
						</div>
						<div style="border:1px solid #d1d5db;border-radius:8px;padding:16px;background:#fff;">
							<div style="font-size:20px;margin-bottom:4px;">🎵 <strong>TikTok Ads</strong></div>
							<p style="color:#6b7280;font-size:13px;margin:4px 0 12px;">TikTok Ads Manager</p>
							<button type="button" class="button" onclick="window.open('<?php echo esc_js( $tiktok_oauth ); ?>', 'tiktok_oauth', 'width=900,height=800')">Connect TikTok →</button>
							<p style="font-size:11px;color:#9ca3af;margin-top:4px;">Pending developer app approval</p>
						</div>
						<div style="border:1px solid #d1d5db;border-radius:8px;padding:16px;background:#fff;">
							<div style="font-size:20px;margin-bottom:4px;">📧 <strong>Email (SMTP)</strong></div>
							<p style="color:#6b7280;font-size:13px;margin:4px 0 12px;">Newsletter sending</p>
							<a href="<?php echo esc_url( admin_url( 'admin.php?page=attribix-woo-settings&tab=newsletter' ) ); ?>" class="button">Configure →</a>
						</div>
					</div>

					<p style="margin-top:16px;font-size:13px;color:#6b7280;">After connecting, a popup will open for authorization. Once done, refresh this page. Then go to <a href="<?php echo esc_url( admin_url( 'admin.php?page=attribix-meta-ads' ) ); ?>">Meta Ads</a> or <a href="<?php echo esc_url( admin_url( 'admin.php?page=attribix-google-ads' ) ); ?>">Google Ads</a> to sync and view your data.</p>

				<?php endif; ?>

				<?php submit_button(); ?>
			</form>
		</div>
		<?php
	}
}
