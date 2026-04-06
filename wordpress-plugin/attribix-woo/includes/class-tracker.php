<?php
namespace Attribix_Woo;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class Tracker {

	public static function init() {
		add_action( 'wp_enqueue_scripts', array( __CLASS__, 'enqueue' ) );
	}

	public static function enqueue() {
		$settings = Settings::get();

		if ( empty( $settings['enabled'] ) || empty( $settings['account_id'] ) ) {
			return;
		}

		wp_register_script(
			'attribix-woo',
			ATTRIBIX_WOO_URL . 'assets/js/attribix.js',
			array(),
			ATTRIBIX_WOO_VERSION,
			true
		);

		$ctx = array(
			'accountID' => (string) $settings['account_id'],
			'endpoint'  => (string) $settings['endpoint'],
			'page'      => self::page_context(),
		);

		wp_add_inline_script(
			'attribix-woo',
			'window.__ATTRIBIX__=' . wp_json_encode( $ctx ) . ';',
			'before'
		);

		wp_enqueue_script( 'attribix-woo' );
	}

	private static function page_context() {
		$ctx = array(
			'type'  => 'other',
			'title' => wp_get_document_title(),
		);

		if ( function_exists( 'is_product' ) && is_product() ) {
			$ctx['type'] = 'product';
			global $product;
			if ( ! $product && function_exists( 'wc_get_product' ) ) {
				$product = wc_get_product( get_the_ID() );
			}
			if ( $product ) {
				$ctx['product'] = array(
					'id'       => $product->get_id(),
					'title'    => $product->get_name(),
					'sku'      => $product->get_sku(),
					'price'    => (float) $product->get_price(),
					'currency' => get_woocommerce_currency(),
				);
			}
		} elseif ( function_exists( 'is_product_category' ) && ( is_product_category() || is_shop() ) ) {
			$ctx['type'] = 'collection';
			$term = get_queried_object();
			if ( $term && isset( $term->name ) ) {
				$ctx['collection'] = array(
					'id'    => isset( $term->term_id ) ? (int) $term->term_id : null,
					'title' => $term->name,
				);
			}
		} elseif ( function_exists( 'is_cart' ) && is_cart() ) {
			$ctx['type'] = 'cart';
		} elseif ( function_exists( 'is_checkout' ) && is_checkout() && ! ( function_exists( 'is_order_received_page' ) && is_order_received_page() ) ) {
			$ctx['type'] = 'checkout';
		} elseif ( is_search() ) {
			$ctx['type']  = 'search';
			$ctx['query'] = get_search_query();
		}

		return $ctx;
	}
}
