<?php
namespace Attribix_Woo;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Newsletter Signup — renders [attribix_newsletter] shortcode and WordPress widget.
 * Submits to Attribix standalone API.
 */
class Newsletter_Widget {

	public static function init() {
		add_shortcode( 'attribix_newsletter', array( __CLASS__, 'render_shortcode' ) );
		add_action( 'wp_ajax_attribix_newsletter_subscribe',        array( __CLASS__, 'ajax_subscribe' ) );
		add_action( 'wp_ajax_nopriv_attribix_newsletter_subscribe', array( __CLASS__, 'ajax_subscribe' ) );
		add_action( 'wp_enqueue_scripts', array( __CLASS__, 'enqueue_assets' ) );
	}

	public static function enqueue_assets() {
		// Only enqueue if shortcode is used on this page (WordPress auto-detects)
		wp_register_script( 'attribix-newsletter', '', array(), '', true );
		wp_add_inline_script( 'attribix-newsletter', self::inline_js() );
	}

	public static function render_shortcode( $atts ) {
		$atts = shortcode_atts( array(
			'title'        => 'Subscribe to our newsletter',
			'button_text'  => 'Subscribe',
			'success_text' => 'Thanks for subscribing!',
			'placeholder'  => 'Enter your email',
			'style'        => 'default', // default | minimal | inline
		), $atts, 'attribix_newsletter' );

		$nonce = wp_create_nonce( 'attribix_newsletter' );
		$style = esc_attr( $atts['style'] );

		ob_start();
		?>
		<div class="attribix-newsletter-form" data-style="<?php echo $style; ?>">
			<?php if ( $atts['title'] ) : ?>
				<h3 class="attribix-nl-title"><?php echo esc_html( $atts['title'] ); ?></h3>
			<?php endif; ?>
			<form class="attribix-nl-form" data-nonce="<?php echo esc_attr( $nonce ); ?>" data-success="<?php echo esc_attr( $atts['success_text'] ); ?>">
				<div class="attribix-nl-fields">
					<input type="email" name="email" placeholder="<?php echo esc_attr( $atts['placeholder'] ); ?>" required class="attribix-nl-input" />
					<button type="submit" class="attribix-nl-button"><?php echo esc_html( $atts['button_text'] ); ?></button>
				</div>
				<div class="attribix-nl-message" style="display:none;"></div>
			</form>
			<style>
				.attribix-newsletter-form { max-width: 480px; margin: 20px 0; }
				.attribix-nl-title { margin: 0 0 12px; font-size: 18px; }
				.attribix-nl-fields { display: flex; gap: 8px; }
				.attribix-nl-input { flex: 1; padding: 10px 14px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 14px; }
				.attribix-nl-button { padding: 10px 20px; background: #111827; color: #fff; border: none; border-radius: 6px; font-size: 14px; cursor: pointer; white-space: nowrap; }
				.attribix-nl-button:hover { background: #374151; }
				.attribix-nl-message { margin-top: 8px; padding: 8px 12px; border-radius: 6px; font-size: 13px; }
				.attribix-nl-message.success { background: #f0fdf4; color: #166534; border: 1px solid #bbf7d0; }
				.attribix-nl-message.error { background: #fef2f2; color: #991b1b; border: 1px solid #fecaca; }
				.attribix-newsletter-form[data-style="minimal"] .attribix-nl-title { font-size: 15px; font-weight: 500; }
				.attribix-newsletter-form[data-style="minimal"] .attribix-nl-input { border-radius: 4px; }
				.attribix-newsletter-form[data-style="minimal"] .attribix-nl-button { border-radius: 4px; }
				.attribix-newsletter-form[data-style="inline"] .attribix-nl-fields { flex-direction: row; }
			</style>
		</div>
		<?php
		wp_enqueue_script( 'attribix-newsletter' );
		return ob_get_clean();
	}

	private static function inline_js() {
		return "
		document.addEventListener('DOMContentLoaded', function() {
			document.querySelectorAll('.attribix-nl-form').forEach(function(form) {
				form.addEventListener('submit', function(e) {
					e.preventDefault();
					var email = form.querySelector('input[name=\"email\"]').value.trim();
					var msg = form.querySelector('.attribix-nl-message');
					var btn = form.querySelector('button');
					if (!email) return;
					btn.disabled = true; btn.textContent = '...';
					fetch('" . esc_url( admin_url( 'admin-ajax.php' ) ) . "', {
						method: 'POST',
						headers: {'Content-Type': 'application/x-www-form-urlencoded'},
						body: 'action=attribix_newsletter_subscribe&nonce=' + form.dataset.nonce + '&email=' + encodeURIComponent(email)
					}).then(function(r){return r.json()}).then(function(data) {
						msg.style.display = 'block';
						if (data.success) {
							msg.className = 'attribix-nl-message success';
							msg.textContent = form.dataset.success;
							form.querySelector('input[name=\"email\"]').value = '';
						} else {
							msg.className = 'attribix-nl-message error';
							msg.textContent = data.data || 'Something went wrong.';
						}
						btn.disabled = false; btn.textContent = form.querySelector('button').dataset.orig || 'Subscribe';
					}).catch(function() {
						msg.style.display = 'block';
						msg.className = 'attribix-nl-message error';
						msg.textContent = 'Network error. Please try again.';
						btn.disabled = false;
					});
				});
			});
		});";
	}

	public static function ajax_subscribe() {
		check_ajax_referer( 'attribix_newsletter', 'nonce' );

		$email = sanitize_email( $_POST['email'] ?? '' );
		if ( ! is_email( $email ) ) {
			wp_send_json_error( 'Please enter a valid email address.' );
		}

		$settings = Settings::get();
		$endpoint = rtrim( $settings['endpoint'] ?? ATTRIBIX_WOO_DEFAULT_ENDPOINT, '/' );
		// Replace /api/track with newsletter subscriber endpoint
		$base_url = str_replace( '/api/track', '', $endpoint );
		$subscribe_url = $base_url . '/api/newsletter/subscribe';

		$response = wp_remote_post( $subscribe_url, array(
			'timeout' => 10,
			'headers' => array( 'Content-Type' => 'application/json' ),
			'body'    => wp_json_encode( array(
				'email'     => $email,
				'source'    => 'woocommerce_widget',
				'accountId' => $settings['account_id'] ?? '',
				'shop'      => home_url(),
			) ),
		) );

		if ( is_wp_error( $response ) ) {
			// Even if API fails, track the event locally
			Http::post_event( 'newsletter_signup', array( 'email' => $email ) );
			wp_send_json_success();
			return;
		}

		$code = wp_remote_retrieve_response_code( $response );
		if ( $code >= 200 && $code < 300 ) {
			wp_send_json_success();
		} else {
			// Fallback: still track as event
			Http::post_event( 'newsletter_signup', array( 'email' => $email ) );
			wp_send_json_success();
		}
	}
}
