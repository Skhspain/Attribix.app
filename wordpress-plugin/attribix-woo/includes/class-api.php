<?php
namespace Attribix_Woo;

if ( ! defined( 'ABSPATH' ) ) exit;

/**
 * API Client — fetches data from api.attribix.app for admin pages.
 */
class Api {

	/**
	 * Get auth headers for API requests.
	 */
	private static function auth_headers() {
		$settings = Settings::get();
		return array(
			'Content-Type'  => 'application/json',
			'X-Account-Id'  => $settings['account_id'] ?? '',
			'X-Api-Key'     => $settings['api_key'] ?? '',
			'X-Shop'        => self::shop_domain(),
		);
	}

	/**
	 * Get the API base URL.
	 */
	private static function base_url() {
		$settings = Settings::get();
		$endpoint = rtrim( $settings['endpoint'] ?? ATTRIBIX_WOO_DEFAULT_ENDPOINT, '/' );
		return str_replace( '/api/track', '', $endpoint );
	}

	/**
	 * GET request to the Attribix standalone API.
	 */
	public static function get( $path, $params = array() ) {
		$url = self::base_url() . $path;

		if ( ! empty( $params ) ) {
			$url .= '?' . http_build_query( $params );
		}

		$response = wp_remote_get( $url, array(
			'timeout' => 15,
			'headers' => self::auth_headers(),
		) );

		if ( is_wp_error( $response ) ) {
			return array( 'ok' => false, 'error' => $response->get_error_message() );
		}

		$body = wp_remote_retrieve_body( $response );
		$data = json_decode( $body, true );
		return is_array( $data ) ? $data : array( 'ok' => false, 'error' => 'Invalid response' );
	}

	/**
	 * POST request to the Attribix standalone API.
	 */
	public static function post( $path, $payload = array() ) {
		$url = self::base_url() . $path;

		$response = wp_remote_post( $url, array(
			'timeout' => 15,
			'headers' => self::auth_headers(),
			'body'    => wp_json_encode( $payload ),
		) );

		if ( is_wp_error( $response ) ) {
			return array( 'ok' => false, 'error' => $response->get_error_message() );
		}

		$resp_body = wp_remote_retrieve_body( $response );
		$data = json_decode( $resp_body, true );
		return is_array( $data ) ? $data : array( 'ok' => false, 'error' => 'Invalid response' );
	}

	/**
	 * Get the shop domain for this WooCommerce site.
	 */
	public static function shop_domain() {
		return wp_parse_url( home_url(), PHP_URL_HOST );
	}

	/**
	 * Format currency amount.
	 */
	public static function money( $amount, $currency = null ) {
		if ( ! $currency ) $currency = get_woocommerce_currency();
		return wc_price( $amount, array( 'currency' => $currency ) );
	}

	/**
	 * Format number with locale.
	 */
	public static function number( $n ) {
		return number_format_i18n( $n );
	}

	/**
	 * Format percentage.
	 */
	public static function pct( $n ) {
		return number_format_i18n( $n, 1 ) . '%';
	}
}
