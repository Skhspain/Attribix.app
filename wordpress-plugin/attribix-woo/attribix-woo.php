<?php
/**
 * Plugin Name: Attribix for WooCommerce
 * Plugin URI:  https://attribix.app
 * Description: Forward WooCommerce storefront and order events to Attribix analytics.
 * Version:     0.1.0
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

define( 'ATTRIBIX_WOO_VERSION', '0.1.0' );
define( 'ATTRIBIX_WOO_FILE', __FILE__ );
define( 'ATTRIBIX_WOO_DIR', plugin_dir_path( __FILE__ ) );
define( 'ATTRIBIX_WOO_URL', plugin_dir_url( __FILE__ ) );
define( 'ATTRIBIX_WOO_OPTION', 'attribix_woo_settings' );
define( 'ATTRIBIX_WOO_DEFAULT_ENDPOINT', 'https://api.attribix.app/api/track' );

require_once ATTRIBIX_WOO_DIR . 'includes/class-http.php';
require_once ATTRIBIX_WOO_DIR . 'includes/class-settings.php';
require_once ATTRIBIX_WOO_DIR . 'includes/class-tracker.php';
require_once ATTRIBIX_WOO_DIR . 'includes/class-server-events.php';

add_action( 'plugins_loaded', function () {
	\Attribix_Woo\Settings::init();
	\Attribix_Woo\Tracker::init();
	\Attribix_Woo\Server_Events::init();
} );

register_activation_hook( __FILE__, function () {
	if ( false === get_option( ATTRIBIX_WOO_OPTION ) ) {
		add_option( ATTRIBIX_WOO_OPTION, array(
			'account_id' => '',
			'endpoint'   => ATTRIBIX_WOO_DEFAULT_ENDPOINT,
			'enabled'    => 1,
		) );
	}
} );
