<?php
namespace Attribix_Woo;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class Server_Events {

	public static function init() {
		add_action( 'woocommerce_new_order', array( __CLASS__, 'on_new_order' ), 10, 1 );
		add_action( 'woocommerce_thankyou', array( __CLASS__, 'on_thankyou' ), 10, 1 );
		add_action( 'woocommerce_add_to_cart', array( __CLASS__, 'on_add_to_cart' ), 10, 6 );
	}

	public static function on_new_order( $order_id ) {
		$order = wc_get_order( $order_id );
		if ( ! $order ) {
			return;
		}
		Http::post_event( 'order_created', self::order_payload( $order ) );
	}

	public static function on_thankyou( $order_id ) {
		$order = wc_get_order( $order_id );
		if ( ! $order ) {
			return;
		}

		$fired_key = '_attribix_purchase_fired';
		if ( $order->get_meta( $fired_key ) ) {
			return;
		}

		Http::post_event( 'checkout_completed', self::order_payload( $order ) );

		$order->update_meta_data( $fired_key, 1 );
		$order->save();
	}

	public static function on_add_to_cart( $cart_item_key, $product_id, $quantity, $variation_id, $variation, $cart_item_data ) {
		$product = function_exists( 'wc_get_product' ) ? wc_get_product( $variation_id ? $variation_id : $product_id ) : null;
		if ( ! $product ) {
			return;
		}
		Http::post_event( 'product_added_to_cart', array(
			'data' => array(
				'cartLine' => array(
					'quantity'     => (int) $quantity,
					'merchandise'  => array(
						'id'            => $product->get_id(),
						'title'         => $product->get_name(),
						'sku'           => $product->get_sku(),
						'price'         => array(
							'amount'       => (float) $product->get_price(),
							'currencyCode' => get_woocommerce_currency(),
						),
					),
				),
			),
		) );
	}

	private static function order_payload( \WC_Order $order ) {
		$line_items = array();
		foreach ( $order->get_items() as $item ) {
			/** @var \WC_Order_Item_Product $item */
			$product = $item->get_product();
			$line_items[] = array(
				'id'       => $item->get_id(),
				'quantity' => (int) $item->get_quantity(),
				'title'    => $item->get_name(),
				'sku'      => $product ? $product->get_sku() : null,
				'price'    => array(
					'amount'       => (float) $order->get_item_total( $item, false, false ),
					'currencyCode' => $order->get_currency(),
				),
				'productId' => $product ? $product->get_id() : null,
			);
		}

		return array(
			'data' => array(
				'checkout' => array(
					'order'      => array( 'id' => $order->get_id() ),
					'orderId'    => $order->get_id(),
					'totalPrice' => array(
						'amount'       => (float) $order->get_total(),
						'currencyCode' => $order->get_currency(),
					),
					'subtotalPrice' => array(
						'amount'       => (float) $order->get_subtotal(),
						'currencyCode' => $order->get_currency(),
					),
					'currencyCode' => $order->get_currency(),
					'lineItems'    => $line_items,
				),
			),
			'context' => array(
				'document' => array(
					'location' => array(
						'href' => $order->get_checkout_order_received_url(),
					),
				),
			),
		);
	}
}
