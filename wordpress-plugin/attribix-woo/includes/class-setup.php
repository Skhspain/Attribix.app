<?php
namespace Attribix_Woo;

if ( ! defined( 'ABSPATH' ) ) exit;

/**
 * Setup — handles one-click connection to Attribix and shows setup banners.
 */
class Setup {

	public static function init() {
		add_action( 'wp_ajax_attribix_connect', array( __CLASS__, 'ajax_connect' ) );
		add_action( 'admin_notices', array( __CLASS__, 'show_setup_banner' ) );
	}

	/**
	 * Check if the plugin is fully connected.
	 */
	public static function is_connected() {
		$settings = Settings::get();
		return ! empty( $settings['account_id'] ) && ! empty( $settings['api_key'] );
	}

	/**
	 * Show a setup banner on all admin pages if not connected.
	 */
	public static function show_setup_banner() {
		if ( self::is_connected() ) return;

		$screen = get_current_screen();
		// Don't show on Attribix settings page (they're already there)
		if ( $screen && strpos( $screen->id, 'attribix-woo-settings' ) !== false ) return;
		if ( $screen && strpos( $screen->id, 'attribix' ) === false ) return;

		?>
		<div class="notice notice-info" style="padding:16px;border-left-color:#6366f1;">
			<div style="display:flex;align-items:center;gap:12px;">
				<span style="font-size:28px;">📊</span>
				<div style="flex:1;">
					<strong style="font-size:15px;">Attribix needs to be connected</strong>
					<p style="margin:4px 0 0;color:#6b7280;">Click the button to automatically connect your store to Attribix. This enables analytics, ad tracking, and all features.</p>
				</div>
				<a href="<?php echo esc_url( admin_url( 'admin.php?page=attribix-woo-settings' ) ); ?>" class="button button-primary" style="white-space:nowrap;">
					Connect Now →
				</a>
			</div>
		</div>
		<?php
	}

	/**
	 * AJAX handler — auto-connect to Attribix API.
	 */
	public static function ajax_connect() {
		check_ajax_referer( 'attribix_connect', 'nonce' );

		if ( ! current_user_can( 'manage_options' ) ) {
			wp_send_json_error( 'Permission denied.' );
		}

		$settings = Settings::get();
		$endpoint = rtrim( $settings['endpoint'] ?? ATTRIBIX_WOO_DEFAULT_ENDPOINT, '/' );
		$base_url = str_replace( '/api/track', '', $endpoint );

		$shop      = wp_parse_url( home_url(), PHP_URL_HOST );
		$site_name = get_bloginfo( 'name' );
		$email     = get_option( 'admin_email' );

		$response = wp_remote_post( $base_url . '/api/woo/connect', array(
			'timeout' => 15,
			'headers' => array( 'Content-Type' => 'application/json' ),
			'body'    => wp_json_encode( array(
				'shop'     => $shop,
				'siteName' => $site_name,
				'email'    => $email,
				'siteUrl'  => home_url(),
			) ),
		) );

		if ( is_wp_error( $response ) ) {
			wp_send_json_error( 'Connection failed: ' . $response->get_error_message() );
		}

		$code = wp_remote_retrieve_response_code( $response );
		$body = json_decode( wp_remote_retrieve_body( $response ), true );

		if ( $code >= 200 && $code < 300 && ! empty( $body['ok'] ) ) {
			// Save the credentials
			$settings['account_id'] = $body['accountId'] ?? '';
			$settings['api_key']    = $body['apiKey'] ?? '';
			update_option( ATTRIBIX_WOO_OPTION, $settings );

			wp_send_json_success( array(
				'message'   => 'Connected successfully!',
				'accountId' => $body['accountId'] ?? '',
			) );
		} else {
			wp_send_json_error( $body['error'] ?? 'Unknown error from Attribix API.' );
		}
	}
}
