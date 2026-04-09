<?php
/**
 * Admin Page: SEO Audit — Scan products for SEO issues.
 */
if ( ! defined( 'ABSPATH' ) ) exit;

// SEO audit runs locally against WooCommerce products — no API needed
$products = array();
$running  = isset( $_POST['run_audit'] ) && wp_verify_nonce( $_POST['_wpnonce'] ?? '', 'attribix_seo_audit' );

if ( $running ) {
	$args = array(
		'post_type'   => 'product',
		'post_status' => 'publish',
		'numberposts' => 100,
	);
	$wc_products = get_posts( $args );

	foreach ( $wc_products as $post ) {
		$product = wc_get_product( $post->ID );
		if ( ! $product ) continue;

		$title       = $product->get_name();
		$description = $product->get_short_description() ?: $product->get_description();
		$desc_len    = mb_strlen( wp_strip_all_tags( $description ) );
		$meta_title  = get_post_meta( $post->ID, '_yoast_wpseo_title', true ) ?: get_post_meta( $post->ID, 'rank_math_title', true ) ?: $title;
		$meta_desc   = get_post_meta( $post->ID, '_yoast_wpseo_metadesc', true ) ?: get_post_meta( $post->ID, 'rank_math_description', true ) ?: '';
		$image_id    = $product->get_image_id();
		$has_image   = ! empty( $image_id );
		$alt_text    = $has_image ? get_post_meta( $image_id, '_wp_attachment_image_alt', true ) : '';

		$issues = array();
		$score  = 100;

		// Title length
		$tlen = mb_strlen( $meta_title );
		if ( $tlen < 30 ) { $issues[] = array( 'type' => 'error', 'msg' => "Title too short ({$tlen} chars, need 30+)" ); $score -= 15; }
		elseif ( $tlen > 60 ) { $issues[] = array( 'type' => 'warning', 'msg' => "Title too long ({$tlen} chars, max 60)" ); $score -= 5; }

		// Meta description
		$dlen = mb_strlen( $meta_desc );
		if ( $dlen === 0 ) { $issues[] = array( 'type' => 'error', 'msg' => 'Missing meta description' ); $score -= 20; }
		elseif ( $dlen < 120 ) { $issues[] = array( 'type' => 'warning', 'msg' => "Meta description too short ({$dlen} chars)" ); $score -= 5; }
		elseif ( $dlen > 160 ) { $issues[] = array( 'type' => 'warning', 'msg' => "Meta description too long ({$dlen} chars)" ); $score -= 5; }

		// Product description
		if ( $desc_len < 50 ) { $issues[] = array( 'type' => 'error', 'msg' => 'Product description too short or missing' ); $score -= 15; }

		// Image
		if ( ! $has_image ) { $issues[] = array( 'type' => 'error', 'msg' => 'No product image' ); $score -= 15; }
		elseif ( empty( $alt_text ) ) { $issues[] = array( 'type' => 'warning', 'msg' => 'Image missing alt text' ); $score -= 10; }

		$products[] = array(
			'id'      => $post->ID,
			'title'   => $title,
			'url'     => get_permalink( $post->ID ),
			'score'   => max( 0, $score ),
			'issues'  => $issues,
		);
	}

	// Sort by score ascending (worst first)
	usort( $products, function( $a, $b ) { return $a['score'] - $b['score']; } );
}

$avg_score = count( $products ) > 0 ? round( array_sum( array_column( $products, 'score' ) ) / count( $products ) ) : 0;
$issues_count = array_sum( array_map( function( $p ) { return count( $p['issues'] ); }, $products ) );
?>
<div class="wrap ax-wrap">
	<h1 style="display:flex;align-items:center;gap:10px;">
		<span style="font-size:24px;">🔍</span> SEO Audit
	</h1>

	<?php if ( ! $running ) : ?>
		<div style="text-align:center;padding:60px 20px;">
			<p style="font-size:48px;margin:0 0 16px;">🔍</p>
			<h2>Scan your products for SEO issues</h2>
			<p style="color:#6b7280;max-width:400px;margin:8px auto 24px;">Check meta titles, descriptions, images, and more across all your WooCommerce products.</p>
			<form method="post">
				<?php wp_nonce_field( 'attribix_seo_audit' ); ?>
				<input type="hidden" name="run_audit" value="1" />
				<button type="submit" class="ax-btn ax-btn-primary" style="font-size:16px;padding:12px 32px;">
					Run SEO Audit
				</button>
			</form>
		</div>
	<?php else : ?>
		<div class="ax-cards" style="grid-template-columns:repeat(3,1fr);">
			<div class="ax-card">
				<p class="ax-card-label">Products Scanned</p>
				<p class="ax-card-value"><?php echo count( $products ); ?></p>
			</div>
			<div class="ax-card">
				<p class="ax-card-label">Avg SEO Score</p>
				<p class="ax-card-value" style="color:<?php echo $avg_score >= 80 ? '#16a34a' : ( $avg_score >= 50 ? '#f59e0b' : '#dc2626' ); ?>">
					<?php echo $avg_score; ?>/100
				</p>
			</div>
			<div class="ax-card">
				<p class="ax-card-label">Total Issues</p>
				<p class="ax-card-value" style="color:<?php echo $issues_count === 0 ? '#16a34a' : '#dc2626'; ?>">
					<?php echo $issues_count; ?>
				</p>
			</div>
		</div>

		<form method="post" style="margin-bottom:16px;">
			<?php wp_nonce_field( 'attribix_seo_audit' ); ?>
			<input type="hidden" name="run_audit" value="1" />
			<button type="submit" class="ax-btn">Re-scan</button>
		</form>

		<div class="ax-table-wrap">
			<table class="ax-table">
				<thead>
					<tr><th>Product</th><th>Score</th><th>Issues</th></tr>
				</thead>
				<tbody>
					<?php foreach ( $products as $p ) : ?>
						<tr>
							<td>
								<a href="<?php echo esc_url( $p['url'] ); ?>" target="_blank" style="text-decoration:none;color:#111827;">
									<strong><?php echo esc_html( $p['title'] ); ?></strong>
								</a>
								<br><a href="<?php echo esc_url( admin_url( 'post.php?post=' . $p['id'] . '&action=edit' ) ); ?>" style="font-size:11px;">Edit →</a>
							</td>
							<td>
								<?php
								$color = $p['score'] >= 80 ? '#16a34a' : ( $p['score'] >= 50 ? '#f59e0b' : '#dc2626' );
								?>
								<span style="font-weight:700;color:<?php echo $color; ?>;font-size:16px;">
									<?php echo $p['score']; ?>
								</span>
							</td>
							<td>
								<?php if ( empty( $p['issues'] ) ) : ?>
									<span style="color:#16a34a;">✓ No issues</span>
								<?php else : ?>
									<?php foreach ( $p['issues'] as $issue ) : ?>
										<div style="margin:2px 0;font-size:12px;">
											<span style="color:<?php echo $issue['type'] === 'error' ? '#dc2626' : '#f59e0b'; ?>;">
												<?php echo $issue['type'] === 'error' ? '✗' : '⚠'; ?>
											</span>
											<?php echo esc_html( $issue['msg'] ); ?>
										</div>
									<?php endforeach; ?>
								<?php endif; ?>
							</td>
						</tr>
					<?php endforeach; ?>
				</tbody>
			</table>
		</div>
	<?php endif; ?>
</div>
