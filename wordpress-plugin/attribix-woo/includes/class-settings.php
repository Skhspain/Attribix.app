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
		add_menu_page(
			__( 'Attribix', 'attribix-woo' ),
			__( 'Attribix', 'attribix-woo' ),
			'manage_options',
			self::SLUG,
			array( __CLASS__, 'render' ),
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
					<a href="<?php echo esc_url( admin_url( 'admin.php?page=' . self::SLUG . '&tab=' . $key ) ); ?>"
					   class="nav-tab <?php echo $tab === $key ? 'nav-tab-active' : ''; ?>">
						<?php echo esc_html( $label ); ?>
					</a>
				<?php endforeach; ?>
			</nav>

			<form method="post" action="options.php" style="max-width:700px;margin-top:20px;">
				<?php settings_fields( self::SLUG ); ?>

				<?php if ( $tab === 'general' ) : ?>
					<table class="form-table">
						<tr>
							<th><label>Account ID</label></th>
							<td>
								<input type="text" name="<?php echo esc_attr( ATTRIBIX_WOO_OPTION ); ?>[account_id]" value="<?php echo esc_attr( $opts['account_id'] ); ?>" class="regular-text" placeholder="acct_..." />
								<p class="description">Your Attribix account identifier. Get it from <a href="https://attribix.app/analytics/settings" target="_blank">attribix.app/analytics/settings</a>.</p>
							</td>
						</tr>
						<tr>
							<th><label>API Endpoint</label></th>
							<td>
								<input type="url" name="<?php echo esc_attr( ATTRIBIX_WOO_OPTION ); ?>[endpoint]" value="<?php echo esc_attr( $opts['endpoint'] ); ?>" class="regular-text code" />
								<p class="description">Leave default unless self-hosting.</p>
							</td>
						</tr>
						<tr>
							<th><label>Tracking</label></th>
							<td>
								<label><input type="checkbox" name="<?php echo esc_attr( ATTRIBIX_WOO_OPTION ); ?>[enabled]" value="1" <?php checked( 1, $opts['enabled'] ); ?> /> Enable event tracking</label>
								<p class="description">When enabled, page views, product views, cart events, and orders are sent to Attribix.</p>
							</td>
						</tr>
					</table>

				<?php elseif ( $tab === 'tracking' ) : ?>
					<h2>Ad Platform Pixels</h2>
					<p class="description">Enter your pixel/tag IDs to fire standard ecommerce events (PageView, ViewContent, AddToCart, Purchase) on your storefront.</p>
					<table class="form-table">
						<tr>
							<th><label>Meta Pixel ID</label></th>
							<td>
								<input type="text" name="<?php echo esc_attr( ATTRIBIX_WOO_OPTION ); ?>[fb_pixel_id]" value="<?php echo esc_attr( $opts['fb_pixel_id'] ); ?>" class="regular-text" placeholder="123456789012345" />
								<p class="description">Facebook/Meta Pixel ID. Find it in <a href="https://business.facebook.com/events_manager" target="_blank">Events Manager</a>.</p>
							</td>
						</tr>
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
					<h2>Ad Platform Integrations</h2>
					<p>Connect your ad accounts to see campaign performance, ROAS, and attribution data in your Attribix dashboard.</p>

					<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:20px;max-width:600px;">
						<?php
						$integrations = array(
							array( 'name' => 'Meta Ads',    'icon' => '📘', 'desc' => 'Facebook & Instagram Ads', 'url' => 'https://attribix.app/analytics/settings' ),
							array( 'name' => 'Google Ads',  'icon' => '📈', 'desc' => 'Google Ads campaigns',     'url' => 'https://attribix.app/analytics/settings' ),
							array( 'name' => 'TikTok Ads',  'icon' => '🎵', 'desc' => 'TikTok Ads Manager',       'url' => 'https://attribix.app/analytics/settings' ),
							array( 'name' => 'Email (SMTP)', 'icon' => '📧', 'desc' => 'Newsletter sending',      'url' => 'https://attribix.app/analytics/newsletter/settings' ),
						);
						foreach ( $integrations as $int ) :
						?>
							<div style="border:1px solid #d1d5db;border-radius:8px;padding:16px;background:#fff;">
								<div style="font-size:20px;margin-bottom:4px;"><?php echo $int['icon']; ?> <strong><?php echo esc_html( $int['name'] ); ?></strong></div>
								<p style="color:#6b7280;font-size:13px;margin:4px 0 12px;"><?php echo esc_html( $int['desc'] ); ?></p>
								<a href="<?php echo esc_url( $int['url'] ); ?>" target="_blank" class="button">Connect →</a>
							</div>
						<?php endforeach; ?>
					</div>

					<h2 style="margin-top:32px;">Full Dashboard</h2>
					<p>Access all features — analytics, attribution, newsletters, reviews, leads, SEO, and more:</p>
					<a href="https://attribix.app/analytics" target="_blank" class="button button-primary button-hero" style="margin-top:8px;">
						Open Attribix Dashboard →
					</a>

				<?php endif; ?>

				<?php submit_button(); ?>
			</form>
		</div>
		<?php
	}
}
