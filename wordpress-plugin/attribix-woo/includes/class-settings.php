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
			'account_id' => '',
			'endpoint'   => ATTRIBIX_WOO_DEFAULT_ENDPOINT,
			'enabled'    => 1,
		);
		$opts = get_option( ATTRIBIX_WOO_OPTION, array() );
		if ( ! is_array( $opts ) ) {
			$opts = array();
		}
		return array_merge( $defaults, $opts );
	}

	public static function menu() {
		add_options_page(
			__( 'Attribix', 'attribix-woo' ),
			__( 'Attribix', 'attribix-woo' ),
			'manage_options',
			self::SLUG,
			array( __CLASS__, 'render' )
		);
	}

	public static function register() {
		register_setting( self::SLUG, ATTRIBIX_WOO_OPTION, array(
			'type'              => 'array',
			'sanitize_callback' => array( __CLASS__, 'sanitize' ),
			'default'           => self::get(),
		) );

		add_settings_section( 'main', __( 'Tracking', 'attribix-woo' ), '__return_false', self::SLUG );

		add_settings_field( 'account_id', __( 'Account ID', 'attribix-woo' ), array( __CLASS__, 'field_account_id' ), self::SLUG, 'main' );
		add_settings_field( 'endpoint', __( 'Ingest endpoint', 'attribix-woo' ), array( __CLASS__, 'field_endpoint' ), self::SLUG, 'main' );
		add_settings_field( 'enabled', __( 'Enabled', 'attribix-woo' ), array( __CLASS__, 'field_enabled' ), self::SLUG, 'main' );
	}

	public static function sanitize( $input ) {
		$out = self::get();
		if ( isset( $input['account_id'] ) ) {
			$out['account_id'] = sanitize_text_field( $input['account_id'] );
		}
		if ( isset( $input['endpoint'] ) ) {
			$url = esc_url_raw( trim( $input['endpoint'] ) );
			$out['endpoint'] = $url ? $url : ATTRIBIX_WOO_DEFAULT_ENDPOINT;
		}
		$out['enabled'] = ! empty( $input['enabled'] ) ? 1 : 0;
		return $out;
	}

	public static function field_account_id() {
		$opts = self::get();
		printf(
			'<input type="text" name="%s[account_id]" value="%s" class="regular-text" placeholder="acct_..." />',
			esc_attr( ATTRIBIX_WOO_OPTION ),
			esc_attr( $opts['account_id'] )
		);
		echo '<p class="description">' . esc_html__( 'Your Attribix account identifier.', 'attribix-woo' ) . '</p>';
	}

	public static function field_endpoint() {
		$opts = self::get();
		printf(
			'<input type="url" name="%s[endpoint]" value="%s" class="regular-text code" />',
			esc_attr( ATTRIBIX_WOO_OPTION ),
			esc_attr( $opts['endpoint'] )
		);
		echo '<p class="description">' . esc_html__( 'Leave default unless self-hosting Attribix.', 'attribix-woo' ) . '</p>';
	}

	public static function field_enabled() {
		$opts = self::get();
		printf(
			'<label><input type="checkbox" name="%s[enabled]" value="1" %s /> %s</label>',
			esc_attr( ATTRIBIX_WOO_OPTION ),
			checked( 1, $opts['enabled'], false ),
			esc_html__( 'Send events to Attribix', 'attribix-woo' )
		);
	}

	public static function render() {
		if ( ! current_user_can( 'manage_options' ) ) {
			return;
		}
		echo '<div class="wrap"><h1>' . esc_html__( 'Attribix for WooCommerce', 'attribix-woo' ) . '</h1><form method="post" action="options.php">';
		settings_fields( self::SLUG );
		do_settings_sections( self::SLUG );
		submit_button();
		echo '</form></div>';
	}
}
