<?php
namespace Attribix_Woo;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class Http {

	public static function post_event( $type, $event = null, $meta = array() ) {
		$settings = Settings::get();

		if ( empty( $settings['enabled'] ) ) {
			return;
		}

		$endpoint = ! empty( $settings['endpoint'] ) ? $settings['endpoint'] : ATTRIBIX_WOO_DEFAULT_ENDPOINT;
		$account  = isset( $settings['account_id'] ) ? (string) $settings['account_id'] : '';

		$body = array(
			'type'      => (string) $type,
			'accountID' => $account,
			'event'     => $event,
			'meta'      => array_merge(
				array(
					't'        => gmdate( 'c' ),
					'platform' => 'woocommerce',
					'source'   => 'server',
					'site'     => home_url(),
				),
				(array) $meta
			),
		);

		wp_remote_post( $endpoint, array(
			'timeout'  => 4,
			'blocking' => false,
			'headers'  => array( 'content-type' => 'application/json' ),
			'body'     => wp_json_encode( $body ),
		) );
	}
}
