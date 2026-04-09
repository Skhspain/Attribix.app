<?php
/**
 * Plugin Name: Attribix for WooCommerce
 * Plugin URI:  https://attribix.app
 * Description: Analytics, attribution, reviews, newsletters & ad tracking for WooCommerce — powered by Attribix.
 * Version:     1.0.0
 * Author:      Attribix
 * License:     GPL-2.0-or-later
 * License URI: https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain: attribix-woo
 * Requires at least: 6.0
 * Requires PHP: 7.4
 * WC requires at least: 7.0
 * WC tested up to: 9.0
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

define( 'ATTRIBIX_WOO_VERSION', '1.0.0' );
define( 'ATTRIBIX_WOO_FILE', __FILE__ );
define( 'ATTRIBIX_WOO_DIR', plugin_dir_path( __FILE__ ) );
define( 'ATTRIBIX_WOO_URL', plugin_dir_url( __FILE__ ) );
define( 'ATTRIBIX_WOO_OPTION', 'attribix_woo_settings' );
define( 'ATTRIBIX_WOO_DEFAULT_ENDPOINT', 'https://api.attribix.app/api/track' );

// Core classes
require_once ATTRIBIX_WOO_DIR . 'includes/class-http.php';
require_once ATTRIBIX_WOO_DIR . 'includes/class-settings.php';
require_once ATTRIBIX_WOO_DIR . 'includes/class-tracker.php';
require_once ATTRIBIX_WOO_DIR . 'includes/class-server-events.php';

// Feature classes
require_once ATTRIBIX_WOO_DIR . 'includes/class-cart.php';
require_once ATTRIBIX_WOO_DIR . 'includes/class-newsletter-widget.php';
require_once ATTRIBIX_WOO_DIR . 'includes/class-reviews-widget.php';
require_once ATTRIBIX_WOO_DIR . 'includes/class-pixel-loader.php';
require_once ATTRIBIX_WOO_DIR . 'includes/class-api.php';
require_once ATTRIBIX_WOO_DIR . 'includes/class-admin-pages.php';

add_action( 'plugins_loaded', function () {
	// Core
	\Attribix_Woo\Settings::init();
	\Attribix_Woo\Tracker::init();
	\Attribix_Woo\Server_Events::init();
	\Attribix_Woo\Cart::init();

	// Features
	\Attribix_Woo\Newsletter_Widget::init();
	\Attribix_Woo\Reviews_Widget::init();
	\Attribix_Woo\Pixel_Loader::init();
	\Attribix_Woo\Admin_Pages::init();
} );

register_activation_hook( __FILE__, function () {
	if ( false === get_option( ATTRIBIX_WOO_OPTION ) ) {
		add_option( ATTRIBIX_WOO_OPTION, array(
			'account_id'      => '',
			'endpoint'        => ATTRIBIX_WOO_DEFAULT_ENDPOINT,
			'enabled'         => 1,
			'fb_pixel_id'     => '',
			'ga4_id'          => '',
			'tt_pixel_id'     => '',
			'reviews_enabled' => 0,
		) );
	}
} );
