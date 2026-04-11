// api/buy-now/scan-style — Auto-detect store theme by scanning the storefront's CSS.
// Looks at the home page and product page for "Add to cart" button styles.
import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { authenticate } from "~/shopify.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const storefront = `https://${shop}`;

  try {
    const html = await fetch(storefront, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; AttribixBot/1.0)" },
    }).then((r) => r.text());

    // Extract <link rel="stylesheet" href="..."> URLs
    const cssLinks: string[] = [];
    const linkRegex = /<link[^>]+rel=["']stylesheet["'][^>]+href=["']([^"']+)["']/gi;
    let match: RegExpExecArray | null;
    while ((match = linkRegex.exec(html)) !== null) {
      cssLinks.push(match[1].startsWith("//") ? `https:${match[1]}` : match[1].startsWith("/") ? `${storefront}${match[1]}` : match[1]);
    }

    // Fetch the first 2-3 CSS files (limit to avoid huge downloads)
    const cssContents = await Promise.all(
      cssLinks.slice(0, 3).map((url) =>
        fetch(url).then((r) => r.text()).catch(() => "")
      )
    );
    const allCss = cssContents.join("\n") + "\n" + html;

    // Detect button color, border-radius, font-family
    const detect = (regex: RegExp) => {
      const m = allCss.match(regex);
      return m ? m[1].trim() : null;
    };

    // Look for product form button styles
    const buttonColor =
      detect(/(?:\.product-form__cart-submit|\.btn--primary|\.product__add-to-cart|button\.add-to-cart|\.shopify-payment-button__button)[^{]*\{[^}]*background(?:-color)?\s*:\s*([^;}]+)/i) ||
      detect(/--color-button[^:]*:\s*([^;}]+)/i) ||
      detect(/--button-background[^:]*:\s*([^;}]+)/i);

    const textColor =
      detect(/(?:\.product-form__cart-submit|\.btn--primary)[^{]*\{[^}]*color\s*:\s*([^;}]+)/i) ||
      detect(/--color-button-text[^:]*:\s*([^;}]+)/i);

    const borderRadius =
      detect(/(?:\.product-form__cart-submit|\.btn|\.button)[^{]*\{[^}]*border-radius\s*:\s*([^;}]+)/i) ||
      detect(/--button-radius[^:]*:\s*([^;}]+)/i) ||
      detect(/--border-radius[^:]*:\s*([^;}]+)/i);

    const fontFamily =
      detect(/body\s*\{[^}]*font-family\s*:\s*([^;}]+)/i) ||
      detect(/--font-body-family[^:]*:\s*([^;}]+)/i);

    return json({
      ok: true,
      shop,
      detected: {
        buttonColor: buttonColor || "#000000",
        textColor: textColor || "#ffffff",
        borderRadius: borderRadius || "6px",
        fontFamily: fontFamily || "inherit",
      },
      // Top-level fields for easy consumption by both Buy Now button + Newsletter widget
      buttonColor: buttonColor || "#000000",
      textColor: textColor || "#ffffff",
      borderRadius: borderRadius || "6px",
      fontFamily: fontFamily || "inherit",
    });
  } catch (e: any) {
    return json({ ok: false, error: e?.message || "Failed to scan store" }, { status: 500 });
  }
}
