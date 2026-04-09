<?php
namespace Attribix_Woo;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Reviews Widget — auto-injects Attribix review widget on WooCommerce product pages.
 * Uses the same /reviews/widget.js script as the Shopify ScriptTag.
 */
class Reviews_Widget {

	public static function init() {
		$settings = Settings::get();
		$reviews_enabled = ! empty( $settings['reviews_enabled'] );

		if ( $reviews_enabled ) {
			add_action( 'woocommerce_after_single_product_summary', array( __CLASS__, 'inject_widget' ), 15 );
			add_shortcode( 'attribix_reviews', array( __CLASS__, 'render_shortcode' ) );
		}
	}

	/**
	 * Auto-inject on product pages after the product summary.
	 */
	public static function inject_widget() {
		if ( ! is_product() ) return;

		$product = wc_get_product( get_the_ID() );
		if ( ! $product ) return;

		$settings   = Settings::get();
		$account_id = $settings['account_id'] ?? '';
		$endpoint   = rtrim( $settings['endpoint'] ?? ATTRIBIX_WOO_DEFAULT_ENDPOINT, '/' );
		$base_url   = str_replace( '/api/track', '', $endpoint );

		$product_id = $product->get_id();
		$shop       = wp_parse_url( home_url(), PHP_URL_HOST );

		echo '<div id="attribix-reviews-widget" data-product-id="' . esc_attr( $product_id ) . '" data-shop="' . esc_attr( $shop ) . '"></div>';
		echo '<script src="' . esc_url( $base_url . '/reviews/widget.js' ) . '?shop=' . urlencode( $shop ) . '&product=' . urlencode( $product_id ) . '&platform=woocommerce" defer></script>';
	}

	/**
	 * Shortcode: [attribix_reviews product_id="123"]
	 * Can be used on any page to display reviews for a specific product.
	 */
	public static function render_shortcode( $atts ) {
		$atts = shortcode_atts( array(
			'product_id' => '',
		), $atts, 'attribix_reviews' );

		$product_id = $atts['product_id'];
		if ( ! $product_id && is_product() ) {
			$product_id = get_the_ID();
		}
		if ( ! $product_id ) return '';

		$settings = Settings::get();
		$endpoint = rtrim( $settings['endpoint'] ?? ATTRIBIX_WOO_DEFAULT_ENDPOINT, '/' );
		$base_url = str_replace( '/api/track', '', $endpoint );
		$shop     = wp_parse_url( home_url(), PHP_URL_HOST );

		ob_start();
		echo '<div id="attribix-reviews-widget" data-product-id="' . esc_attr( $product_id ) . '" data-shop="' . esc_attr( $shop ) . '"></div>';
		echo '<script src="' . esc_url( $base_url . '/reviews/widget.js' ) . '?shop=' . urlencode( $shop ) . '&product=' . urlencode( $product_id ) . '&platform=woocommerce" defer></script>';
		return ob_get_clean();
	}
}
