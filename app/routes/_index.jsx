// app/routes/_index.jsx
import { redirect } from "@remix-run/node";

export async function loader({ request }) {
  const url = new URL(request.url);
  // If Shopify embeds the app, forward to /app with params
  if (url.searchParams.get("shop") || url.searchParams.get("hmac")) {
    return redirect(`/app${url.search}`);
  }
  // Otherwise show the landing page
  return null;
}

export default function Index() {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Attribix — Ad Attribution for Shopify</title>
        <style>{`
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            background: #0a0a0a;
            color: #fff;
            min-height: 100vh;
          }
          nav {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 24px 48px;
            border-bottom: 1px solid #1a1a1a;
          }
          .logo { font-size: 22px; font-weight: 700; letter-spacing: -0.5px; }
          .logo span { color: #6c47ff; }
          .badge {
            background: #6c47ff22;
            color: #9d7eff;
            border: 1px solid #6c47ff44;
            padding: 4px 12px;
            border-radius: 20px;
            font-size: 13px;
          }
          .hero {
            text-align: center;
            padding: 100px 24px 80px;
            max-width: 800px;
            margin: 0 auto;
          }
          .hero h1 {
            font-size: clamp(36px, 6vw, 64px);
            font-weight: 800;
            line-height: 1.1;
            letter-spacing: -1px;
            margin-bottom: 24px;
          }
          .hero h1 em { color: #6c47ff; font-style: normal; }
          .hero p {
            font-size: 18px;
            color: #888;
            line-height: 1.7;
            max-width: 560px;
            margin: 0 auto 40px;
          }
          .cta {
            display: inline-block;
            background: #6c47ff;
            color: #fff;
            padding: 14px 32px;
            border-radius: 8px;
            font-size: 16px;
            font-weight: 600;
            text-decoration: none;
          }
          .features {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
            gap: 24px;
            max-width: 1000px;
            margin: 0 auto;
            padding: 0 24px 100px;
          }
          .feature {
            background: #111;
            border: 1px solid #1e1e1e;
            border-radius: 12px;
            padding: 28px;
          }
          .feature .icon { font-size: 28px; margin-bottom: 14px; }
          .feature h3 { font-size: 16px; font-weight: 600; margin-bottom: 8px; }
          .feature p { font-size: 14px; color: #666; line-height: 1.6; }
          .footer {
            text-align: center;
            padding: 32px;
            border-top: 1px solid #1a1a1a;
            color: #444;
            font-size: 13px;
          }
        `}</style>
      </head>
      <body>
        <nav>
          <div className="logo">Attri<span>bix</span></div>
          <span className="badge">Shopify App</span>
        </nav>

        <div className="hero">
          <h1>Know exactly what's<br /><em>driving your sales</em></h1>
          <p>
            Attribix connects your Meta and Google Ads to your Shopify store,
            giving you accurate attribution, real-time ROAS, and campaign-level
            insights — all in one place.
          </p>
          <a
            className="cta"
            href="https://apps.shopify.com/attribix-app"
          >
            Install on Shopify
          </a>
        </div>

        <div className="features">
          <div className="feature">
            <div className="icon">📊</div>
            <h3>Multi-platform analytics</h3>
            <p>See Meta and Google Ads performance side by side with blended ROAS and CPA.</p>
          </div>
          <div className="feature">
            <div className="icon">🎯</div>
            <h3>Accurate attribution</h3>
            <p>Server-side tracking via Meta CAPI and Google offline conversions for reliable data.</p>
          </div>
          <div className="feature">
            <div className="icon">⚡</div>
            <h3>Automatic sync</h3>
            <p>Campaign spend syncs automatically every 24 hours. No manual exports needed.</p>
          </div>
          <div className="feature">
            <div className="icon">🏆</div>
            <h3>Campaign insights</h3>
            <p>See which campaigns, ad sets, and ads are performing — and which are wasting budget.</p>
          </div>
        </div>

        <div className="footer">
          © {new Date().getFullYear()} Attribix · Ad attribution for Shopify stores
        </div>
      </body>
    </html>
  );
}
