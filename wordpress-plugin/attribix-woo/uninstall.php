<?php
if ( ! defined( 'WP_UNINSTALL_PLUGIN' ) ) {
	exit;
}

// Remove plugin settings
delete_option( 'attribix_woo_settings' );

// Remove all cached transients created by the plugin (prefixed ax_)
global $wpdb;
$wpdb->query(
	"DELETE FROM {$wpdb->options}
	 WHERE option_name LIKE '_transient_ax\_%'
	    OR option_name LIKE '_transient_timeout_ax\_%'"
);
