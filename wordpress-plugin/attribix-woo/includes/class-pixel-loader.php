<?php
namespace Attribix_Woo;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Pixel Loader — injects Meta Pixel, Google Tag, and TikTok Pixel on the storefront.
 * Also fires standard ecommerce events (ViewContent, AddToCart, Purchase).
 */
class Pixel_Loader {

	public static function init() {
		add_action( 'wp_head', array( __CLASS__, 'inject_pixels' ), 5 );
		add_action( 'wp_body_open', array( __CLASS__, 'inject_noscript_pixels' ), 5 );
		add_action( 'woocommerce_thankyou', array( __CLASS__, 'purchase_pixels' ), 5, 1 );
	}

	/**
	 * Inject pixel base codes in <head>.
	 */
	public static function inject_pixels() {
		$settings = Settings::get();

		// Meta Pixel
		$fb_pixel = $settings['fb_pixel_id'] ?? '';
		if ( $fb_pixel ) {
			echo "<!-- Meta Pixel -->\n";
			echo "<script>!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');";
			echo "fbq('init','" . esc_js( $fb_pixel ) . "');fbq('track','PageView');</script>\n";

			// ViewContent on product pages
			if ( function_exists( 'is_product' ) && is_product() ) {
				$product = wc_get_product( get_the_ID() );
				if ( $product ) {
					echo "<script>fbq('track','ViewContent',{content_name:'" . esc_js( $product->get_name() ) . "',content_ids:['" . esc_js( $product->get_id() ) . "'],content_type:'product',value:" . (float) $product->get_price() . ",currency:'" . esc_js( get_woocommerce_currency() ) . "'});</script>\n";
				}
			}
		}

		// Google Tag (gtag.js)
		$ga4_id = $settings['ga4_id'] ?? '';
		if ( $ga4_id ) {
			echo "<!-- Google tag (gtag.js) -->\n";
			echo '<script async src="https://www.googletagmanager.com/gtag/js?id=' . esc_attr( $ga4_id ) . '"></script>';
			echo "<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','" . esc_js( $ga4_id ) . "');</script>\n";

			// view_item on product pages
			if ( function_exists( 'is_product' ) && is_product() ) {
				$product = wc_get_product( get_the_ID() );
				if ( $product ) {
					echo "<script>gtag('event','view_item',{currency:'" . esc_js( get_woocommerce_currency() ) . "',value:" . (float) $product->get_price() . ",items:[{item_id:'" . esc_js( $product->get_id() ) . "',item_name:'" . esc_js( $product->get_name() ) . "',price:" . (float) $product->get_price() . "}]});</script>\n";
				}
			}
		}

		// TikTok Pixel
		$tt_pixel = $settings['tt_pixel_id'] ?? '';
		if ( $tt_pixel ) {
			echo "<!-- TikTok Pixel -->\n";
			echo "<script>!function(w,d,t){w.TiktokAnalyticsObject=t;var ttq=w[t]=w[t]||[];ttq.methods=['page','track','identify','instances','debug','on','off','once','ready','alias','group','enableCookie','disableCookie','holdConsent','revokeConsent','grantConsent'],ttq.setAndDefer=function(t,e){t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}};for(var i=0;i<ttq.methods.length;i++)ttq.setAndDefer(ttq,ttq.methods[i]);ttq.instance=function(t){for(var e=ttq._i[t]||[],n=0;n<ttq.methods.length;n++)ttq.setAndDefer(e,ttq.methods[n]);return e};ttq.load=function(e,n){var r='https://analytics.tiktok.com/i18n/pixel/events.js',o=n&&n.partner;ttq._i=ttq._i||{},ttq._i[e]=[],ttq._i[e]._u=r,ttq._t=ttq._t||{},ttq._t[e]=+new Date,ttq._o=ttq._o||{},ttq._o[e]=n||{};var i=d.createElement('script');i.type='text/javascript',i.async=!0,i.src=r+'?sdkid='+e+'&lib='+t;var a=d.getElementsByTagName('script')[0];a.parentNode.insertBefore(i,a)}}(window,document,'ttq');";
			echo "ttq.load('" . esc_js( $tt_pixel ) . "');ttq.page();</script>\n";

			// ViewContent on product pages
			if ( function_exists( 'is_product' ) && is_product() ) {
				$product = wc_get_product( get_the_ID() );
				if ( $product ) {
					echo "<script>ttq.track('ViewContent',{content_id:'" . esc_js( $product->get_id() ) . "',content_name:'" . esc_js( $product->get_name() ) . "',content_type:'product',value:" . (float) $product->get_price() . ",currency:'" . esc_js( get_woocommerce_currency() ) . "'});</script>\n";
				}
			}
		}
	}

	/**
	 * Inject noscript fallback tags in <body> for pixels that require them.
	 * Fires on wp_body_open (requires theme support, WP 5.2+).
	 */
	public static function inject_noscript_pixels() {
		$settings = Settings::get();
		$fb_pixel = $settings['fb_pixel_id'] ?? '';
		if ( $fb_pixel ) {
			echo '<noscript><img height="1" width="1" style="display:none" src="https://www.facebook.com/tr?id=' . esc_attr( $fb_pixel ) . '&ev=PageView&noscript=1" /></noscript>' . "\n";
		}
	}

	/**
	 * Fire purchase events on the thank-you page.
	 */
	public static function purchase_pixels( $order_id ) {
		$order = wc_get_order( $order_id );
		if ( ! $order ) return;

		// Deduplicate with meta
		if ( $order->get_meta( '_attribix_pixels_fired' ) ) return;

		$total    = (float) $order->get_total();
		$currency = $order->get_currency();
		$settings = Settings::get();

		$content_ids = array();
		$items_ga    = array();
		foreach ( $order->get_items() as $item ) {
			$product = $item->get_product();
			$pid     = $product ? $product->get_id() : $item->get_product_id();
			$content_ids[] = "'" . esc_js( $pid ) . "'";
			$items_ga[]    = "{item_id:'" . esc_js( $pid ) . "',item_name:'" . esc_js( $item->get_name() ) . "',quantity:" . (int) $item->get_quantity() . ",price:" . (float) $order->get_item_total( $item ) . "}";
		}

		// Meta Purchase
		if ( ! empty( $settings['fb_pixel_id'] ) ) {
			echo "<script>fbq('track','Purchase',{value:" . $total . ",currency:'" . esc_js( $currency ) . "',content_ids:[" . implode( ',', $content_ids ) . "],content_type:'product',order_id:'" . esc_js( $order_id ) . "'});</script>\n";
		}

		// Google purchase
		if ( ! empty( $settings['ga4_id'] ) ) {
			echo "<script>gtag('event','purchase',{transaction_id:'" . esc_js( $order_id ) . "',value:" . $total . ",currency:'" . esc_js( $currency ) . "',items:[" . implode( ',', $items_ga ) . "]});</script>\n";
		}

		// TikTok CompletePayment
		if ( ! empty( $settings['tt_pixel_id'] ) ) {
			echo "<script>ttq.track('CompletePayment',{value:" . $total . ",currency:'" . esc_js( $currency ) . "',content_id:'" . esc_js( $order_id ) . "',content_type:'product'});</script>\n";
		}

		$order->update_meta_data( '_attribix_pixels_fired', 1 );
		$order->save();
	}
}
