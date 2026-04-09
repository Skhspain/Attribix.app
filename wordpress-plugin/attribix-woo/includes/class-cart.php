<?php
namespace Attribix_Woo;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Cart tracking — sends cart_updated events for abandonment detection.
 */
class Cart {

	public static function init() {
		add_action( 'woocommerce_cart_updated',   array( __CLASS__, 'on_cart_updated' ) );
		add_action( 'woocommerce_cart_emptied',   array( __CLASS__, 'on_cart_emptied' ) );
	}

	public static function on_cart_updated() {
		if ( ! function_exists( 'WC' ) || ! WC()->cart ) return;

		$cart  = WC()->cart;
		$items = array();

		foreach ( $cart->get_cart() as $item ) {
			$product = $item['data'];
			if ( ! $product ) continue;

			$items[] = array(
				'productId'    => $item['product_id'],
				'variationId'  => $item['variation_id'] ?: null,
				'title'        => $product->get_name(),
				'sku'          => $product->get_sku(),
				'quantity'     => (int) $item['quantity'],
				'price'        => (float) $product->get_price(),
				'lineTotal'    => (float) $item['line_total'],
			);
		}

		// Only send if cart has items (avoids noise from empty carts)
		if ( empty( $items ) ) return;

		Http::post_event( 'cart_updated', array(
			'itemCount'    => $cart->get_cart_contents_count(),
			'totalPrice'   => array(
				'amount'       => (float) $cart->get_total( 'edit' ),
				'currencyCode' => get_woocommerce_currency(),
			),
			'subtotal'     => (float) $cart->get_subtotal(),
			'items'        => $items,
			'coupons'      => $cart->get_applied_coupons(),
		) );
	}

	public static function on_cart_emptied() {
		Http::post_event( 'cart_emptied', array(
			'currency' => get_woocommerce_currency(),
		) );
	}
}
