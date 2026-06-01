<?php
namespace Attribix_Woo;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class Server_Events {

	public static function init() {
		add_action( 'woocommerce_new_order',              array( __CLASS__, 'on_new_order' ), 10, 1 );
		add_action( 'woocommerce_thankyou',               array( __CLASS__, 'on_thankyou' ), 10, 1 );
		add_action( 'woocommerce_add_to_cart',            array( __CLASS__, 'on_add_to_cart' ), 10, 6 );
		add_action( 'woocommerce_order_refunded',         array( __CLASS__, 'on_refund' ), 10, 2 );
		add_action( 'woocommerce_order_status_changed',   array( __CLASS__, 'on_status_change' ), 10, 4 );
	}

	// ─── Order Created ──────────────────────────────────────────────────
	public static function on_new_order( $order_id ) {
		$order = wc_get_order( $order_id );
		if ( ! $order ) return;
		Http::post_event( 'order_created', self::order_payload( $order ) );
	}

	// ─── Checkout Completed (once per order) ────────────────────────────
	public static function on_thankyou( $order_id ) {
		$order = wc_get_order( $order_id );
		if ( ! $order ) return;

		$fired_key = '_attribix_purchase_fired';
		if ( $order->get_meta( $fired_key ) ) return;

		Http::post_event( 'checkout_completed', self::order_payload( $order ) );

		$order->update_meta_data( $fired_key, 1 );
		$order->save();
	}

	// ─── Add to Cart ────────────────────────────────────────────────────
	public static function on_add_to_cart( $cart_item_key, $product_id, $quantity, $variation_id, $variation, $cart_item_data ) {
		$product = function_exists( 'wc_get_product' ) ? wc_get_product( $variation_id ? $variation_id : $product_id ) : null;
		if ( ! $product ) return;

		$categories = array();
		$terms = get_the_terms( $product_id, 'product_cat' );
		if ( $terms && ! is_wp_error( $terms ) ) {
			foreach ( $terms as $t ) $categories[] = $t->name;
		}

		Http::post_event( 'product_added_to_cart', array(
			'data' => array(
				'cartLine' => array(
					'quantity'    => (int) $quantity,
					'merchandise' => array(
						'id'            => $product->get_id(),
						'title'         => $product->get_name(),
						'sku'           => $product->get_sku(),
						'price'         => array(
							'amount'       => (float) $product->get_price(),
							'currencyCode' => get_woocommerce_currency(),
						),
						'categories'    => $categories,
						'variant'       => $variation_id ? $variation_id : null,
						'image'         => wp_get_attachment_url( $product->get_image_id() ) ?: null,
					),
				),
			),
		) );
	}

	// ─── Refund ─────────────────────────────────────────────────────────
	public static function on_refund( $order_id, $refund_id ) {
		$order  = wc_get_order( $order_id );
		$refund = wc_get_order( $refund_id );
		if ( ! $order || ! $refund ) return;

		$refund_items = array();
		foreach ( $refund->get_items() as $item ) {
			$product = $item->get_product();
			$refund_items[] = array(
				'productId' => $product ? $product->get_id() : null,
				'title'     => $item->get_name(),
				'quantity'  => abs( (int) $item->get_quantity() ),
				'amount'    => abs( (float) $item->get_total() ),
			);
		}

		Http::post_event( 'order_refunded', array(
			'orderId'       => $order_id,
			'refundId'      => $refund_id,
			'refundAmount'  => abs( (float) $refund->get_total() ),
			'currency'      => $order->get_currency(),
			'reason'        => $refund->get_reason(),
			'items'         => $refund_items,
			'customer'      => self::customer_data( $order ),
		) );
	}

	// ─── Order Status Changed ───────────────────────────────────────────
	public static function on_status_change( $order_id, $from, $to, $order ) {
		Http::post_event( 'order_status_changed', array(
			'orderId'    => $order_id,
			'fromStatus' => $from,
			'toStatus'   => $to,
			'currency'   => $order->get_currency(),
			'total'      => (float) $order->get_total(),
			'customer'   => self::customer_data( $order ),
		) );
	}

	// ─── Full Order Payload ─────────────────────────────────────────────
	private static function order_payload( \WC_Order $order ) {
		$line_items = array();
		foreach ( $order->get_items() as $item ) {
			$product = $item->get_product();
			$categories = array();
			$pid = $item->get_product_id();
			$terms = get_the_terms( $pid, 'product_cat' );
			if ( $terms && ! is_wp_error( $terms ) ) {
				foreach ( $terms as $t ) $categories[] = $t->name;
			}

			$line_items[] = array(
				'id'         => $item->get_id(),
				'quantity'   => (int) $item->get_quantity(),
				'title'      => $item->get_name(),
				'sku'        => $product ? $product->get_sku() : null,
				'price'      => array(
					'amount'       => (float) $order->get_item_total( $item, false, false ),
					'currencyCode' => $order->get_currency(),
				),
				'productId'  => $product ? $product->get_id() : null,
				'categories' => $categories,
				'variant'    => $product && $product->is_type( 'variation' ) ? $product->get_id() : null,
				'image'      => $product ? wp_get_attachment_url( $product->get_image_id() ) : null,
			);
		}

		// Coupon codes
		$coupons = array();
		foreach ( $order->get_coupon_codes() as $code ) {
			$coupons[] = $code;
		}

		return array(
			'data' => array(
				'checkout' => array(
					'order'          => array( 'id' => $order->get_id() ),
					'orderId'        => $order->get_id(),
					'totalPrice'     => array(
						'amount'       => (float) $order->get_total(),
						'currencyCode' => $order->get_currency(),
					),
					'subtotalPrice'  => array(
						'amount'       => (float) $order->get_subtotal(),
						'currencyCode' => $order->get_currency(),
					),
					'currencyCode'   => $order->get_currency(),
					'lineItems'      => $line_items,
					'discountAmount' => (float) $order->get_discount_total(),
					'coupons'        => $coupons,
					'shippingMethod' => $order->get_shipping_method(),
					'shippingAmount' => (float) $order->get_shipping_total(),
					'taxAmount'      => (float) $order->get_total_tax(),
					'paymentMethod'  => $order->get_payment_method_title(),
				),
			),
			'customer' => self::customer_data( $order ),
			'context'  => array(
				'document' => array(
					'location' => array(
						'href' => $order->get_checkout_order_received_url(),
					),
				),
			),
		);
	}

	// ─── Customer Data Helper ───────────────────────────────────────────
	private static function customer_data( \WC_Order $order ) {
		return array(
			'email'     => $order->get_billing_email(),
			'firstName' => $order->get_billing_first_name(),
			'lastName'  => $order->get_billing_last_name(),
			'phone'     => $order->get_billing_phone(),
			'company'   => $order->get_billing_company(),
			'city'      => $order->get_billing_city(),
			'state'     => $order->get_billing_state(),
			'country'   => $order->get_billing_country(),
			'postcode'  => $order->get_billing_postcode(),
			'customerId' => $order->get_customer_id(),
			'orderCount' => $order->get_customer_id() ? (int) wc_get_customer_order_count( $order->get_customer_id() ) : 0,
		);
	}
}
