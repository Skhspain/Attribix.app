<?php
namespace Attribix_Woo;

if ( ! defined( 'ABSPATH' ) ) exit;

/**
 * Admin Pages — registers all WordPress admin menu pages and loads renderers.
 */
class Admin_Pages {

	const PARENT = 'attribix-woo';

	public static function init() {
		add_action( 'admin_menu', array( __CLASS__, 'register_menus' ), 20 );
		add_action( 'admin_enqueue_scripts', array( __CLASS__, 'enqueue_styles' ) );
	}

	public static function enqueue_styles( $hook ) {
		if ( strpos( $hook, 'attribix' ) === false ) return;

		wp_add_inline_style( 'wp-admin', self::global_css() );
	}

	public static function register_menus() {
		$pages = array(
			array( 'slug' => 'attribix-dashboard',            'title' => 'Dashboard',          'file' => 'dashboard' ),
			array( 'slug' => 'attribix-meta-ads',             'title' => 'Meta Ads',           'file' => 'meta-ads' ),
			array( 'slug' => 'attribix-google-ads',           'title' => 'Google Ads',         'file' => 'google-ads' ),
			array( 'slug' => 'attribix-attribution',          'title' => 'Attribution',        'file' => 'attribution' ),
			array( 'slug' => 'attribix-products',             'title' => 'Products',           'file' => 'products' ),
			array( 'slug' => 'attribix-orders',               'title' => 'Orders',             'file' => 'orders' ),
			array( 'slug' => 'attribix-newsletter',           'title' => 'Newsletter',         'file' => 'newsletter' ),
			array( 'slug' => 'attribix-newsletter-editor',    'title' => 'Newsletter Editor',  'file' => 'newsletter-editor', 'hidden' => true ),
			array( 'slug' => 'attribix-newsletter-templates', 'title' => 'Templates',          'file' => 'newsletter-templates', 'hidden' => true ),
			array( 'slug' => 'attribix-flows',                'title' => 'Automation Flows',   'file' => 'flows' ),
			array( 'slug' => 'attribix-reviews',              'title' => 'Reviews',            'file' => 'reviews' ),
			array( 'slug' => 'attribix-review-settings',      'title' => 'Widget Settings',    'file' => 'review-settings', 'hidden' => true ),
			array( 'slug' => 'attribix-leads',                'title' => 'Lead Center',        'file' => 'leads' ),
			array( 'slug' => 'attribix-seo',                  'title' => 'SEO Audit',          'file' => 'seo' ),
			array( 'slug' => 'attribix-utm',                  'title' => 'UTM Builder',        'file' => 'utm' ),
			array( 'slug' => 'attribix-feeds',                'title' => 'Product Feeds',      'file' => 'feeds' ),
			array( 'slug' => 'attribix-buy-now',              'title' => 'Buy Now Button',     'file' => 'buy-now' ),
			array( 'slug' => 'attribix-billing',              'title' => 'Billing',            'file' => 'billing' ),
		);

		// First submenu replaces parent page
		add_submenu_page(
			self::PARENT,
			'Dashboard',
			'Dashboard',
			'manage_options',
			self::PARENT,
			array( __CLASS__, 'render_page' )
		);

		foreach ( $pages as $p ) {
			if ( $p['slug'] === 'attribix-dashboard' ) continue; // already added as parent
			add_submenu_page(
				self::PARENT,
				$p['title'],
				$p['title'],
				'manage_options',
				$p['slug'],
				array( __CLASS__, 'render_page' )
			);
		}

		// Settings is last
		add_submenu_page(
			self::PARENT,
			'Settings',
			'Settings',
			'manage_options',
			self::PARENT . '-settings',
			array( 'Attribix_Woo\Settings', 'render' )
		);
	}

	public static function render_page() {
		if ( ! current_user_can( 'manage_options' ) ) return;

		$screen = get_current_screen();
		$slug   = $screen ? $screen->id : '';

		// Map screen ID to page file
		$map = array(
			'toplevel_page_attribix-woo'                    => 'dashboard',
			'attribix_page_attribix-meta-ads'               => 'meta-ads',
			'attribix_page_attribix-google-ads'             => 'google-ads',
			'attribix_page_attribix-attribution'            => 'attribution',
			'attribix_page_attribix-products'               => 'products',
			'attribix_page_attribix-orders'                 => 'orders',
			'attribix_page_attribix-newsletter'             => 'newsletter',
			'attribix_page_attribix-newsletter-editor'      => 'newsletter-editor',
			'attribix_page_attribix-newsletter-templates'   => 'newsletter-templates',
			'attribix_page_attribix-flows'                  => 'flows',
			'attribix_page_attribix-reviews'                => 'reviews',
			'attribix_page_attribix-review-settings'        => 'review-settings',
			'attribix_page_attribix-leads'                  => 'leads',
			'attribix_page_attribix-seo'                    => 'seo',
			'attribix_page_attribix-utm'                    => 'utm',
			'attribix_page_attribix-feeds'                  => 'feeds',
			'attribix_page_attribix-buy-now'                => 'buy-now',
			'attribix_page_attribix-billing'                => 'billing',
		);

		$page_file = isset( $map[ $slug ] ) ? $map[ $slug ] : 'dashboard';
		$file_path = ATTRIBIX_WOO_DIR . 'includes/admin-pages/' . $page_file . '.php';

		if ( file_exists( $file_path ) ) {
			include $file_path;
		} else {
			echo '<div class="wrap"><h1>Attribix</h1><p>Page coming soon.</p></div>';
		}

		// Referral footer on every page
		echo '<div style="text-align:center;margin:40px 0 20px;padding:20px;border-top:1px solid #e5e7eb;">';
		echo '<p style="color:#9ca3af;font-size:13px;margin:0;">Powered by <a href="https://attribix.app" target="_blank" style="color:#6366f1;text-decoration:none;font-weight:600;">Attribix</a></p>';
		echo '<p style="color:#6b7280;font-size:12px;margin:6px 0 0;">Want to work with us? <a href="https://attribix.app/partners" target="_blank" style="color:#6366f1;text-decoration:underline;">Become a partner →</a></p>';
		echo '</div>';
	}

	private static function global_css() {
		return '
		.ax-wrap { max-width: 1200px; }
		.ax-cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 16px; margin: 20px 0; }
		.ax-card { background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px 20px; }
		.ax-card-label { font-size: 12px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px; margin: 0 0 4px; }
		.ax-card-value { font-size: 24px; font-weight: 700; color: #111827; margin: 0; }
		.ax-card-sub { font-size: 12px; color: #9ca3af; margin: 4px 0 0; }
		.ax-table-wrap { background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden; margin: 20px 0; }
		.ax-table { width: 100%; border-collapse: collapse; font-size: 13px; }
		.ax-table th { text-align: left; padding: 10px 14px; background: #f9fafb; color: #6b7280; font-weight: 600; border-bottom: 2px solid #e5e7eb; white-space: nowrap; }
		.ax-table td { padding: 10px 14px; border-bottom: 1px solid #f3f4f6; color: #374151; }
		.ax-table tr:hover td { background: #f9fafb; }
		.ax-badge { display: inline-block; padding: 2px 8px; border-radius: 10px; font-size: 11px; font-weight: 600; }
		.ax-badge-green { background: #ecfdf5; color: #065f46; }
		.ax-badge-red { background: #fef2f2; color: #991b1b; }
		.ax-badge-yellow { background: #fffbeb; color: #92400e; }
		.ax-badge-blue { background: #eff6ff; color: #1e40af; }
		.ax-badge-gray { background: #f3f4f6; color: #6b7280; }
		.ax-section { margin: 24px 0; }
		.ax-section-title { font-size: 16px; font-weight: 600; color: #111827; margin: 0 0 12px; }
		.ax-empty { text-align: center; padding: 40px 20px; color: #9ca3af; }
		.ax-tabs { display: flex; gap: 0; border-bottom: 1px solid #e5e7eb; margin-bottom: 20px; }
		.ax-tab { padding: 10px 16px; text-decoration: none; color: #6b7280; font-size: 14px; border-bottom: 2px solid transparent; margin-bottom: -1px; }
		.ax-tab:hover { color: #111827; }
		.ax-tab-active { color: #111827; font-weight: 600; border-bottom-color: #111827; }
		.ax-btn { display: inline-block; padding: 8px 16px; border-radius: 6px; font-size: 13px; font-weight: 500; text-decoration: none; cursor: pointer; border: 1px solid #d1d5db; background: #fff; color: #374151; }
		.ax-btn:hover { background: #f9fafb; }
		.ax-btn-primary { background: #111827; color: #fff; border-color: #111827; }
		.ax-btn-primary:hover { background: #374151; color: #fff; }
		.ax-row { display: flex; gap: 16px; align-items: center; flex-wrap: wrap; }
		.ax-spacer { flex: 1; }
		';
	}
}
