// app/routes/privacy.tsx
// Public privacy policy page — required for Meta app review and Shopify app listing.

export default function PrivacyPolicy() {
  return (
    <div style={{ maxWidth: 760, margin: "0 auto", padding: "48px 24px", fontFamily: "system-ui, sans-serif", color: "#111", lineHeight: 1.7 }}>
      <h1 style={{ fontSize: 32, fontWeight: 700, marginBottom: 8 }}>Privacy Policy</h1>
      <p style={{ color: "#555", marginBottom: 40 }}>Last updated: April 4, 2026</p>

      <p>Attribix ("we", "our", or "us") operates as a Shopify app that provides marketing analytics, attribution, lead management, newsletter, and review tools for e-commerce merchants. This Privacy Policy explains how we collect, use, and protect data when you use our app.</p>

      <h2 style={{ fontSize: 20, fontWeight: 600, marginTop: 40, marginBottom: 12 }}>1. Data We Collect</h2>
      <p>When you install and use Attribix, we collect and process the following data:</p>
      <ul style={{ paddingLeft: 24 }}>
        <li><strong>Store data:</strong> Your Shopify store name, domain, and configuration settings.</li>
        <li><strong>Order data:</strong> Order IDs, totals, and UTM attribution data to provide revenue analytics.</li>
        <li><strong>Ad account data:</strong> Campaign names, spend figures, and performance metrics from connected Meta and Google Ads accounts (read-only).</li>
        <li><strong>Visitor data:</strong> Anonymous visitor IDs, session data, UTM parameters, and click IDs collected via our tracking pixel for attribution purposes.</li>
        <li><strong>Lead data:</strong> Contact information (name, email, phone) submitted via Meta Lead Ad Forms and imported leads.</li>
        <li><strong>Subscriber data:</strong> Email addresses and names of newsletter subscribers collected via signup forms.</li>
        <li><strong>Review data:</strong> Product reviews submitted by your customers.</li>
      </ul>

      <h2 style={{ fontSize: 20, fontWeight: 600, marginTop: 40, marginBottom: 12 }}>2. How We Use Your Data</h2>
      <ul style={{ paddingLeft: 24 }}>
        <li>To provide attribution analytics and revenue reporting</li>
        <li>To sync ad campaign performance from Meta and Google Ads</li>
        <li>To deliver lead management and CRM functionality</li>
        <li>To send newsletter campaigns to your subscribers on your behalf</li>
        <li>To display and manage customer reviews on your store</li>
        <li>To send server-side conversion events to Meta (Conversions API) on your behalf</li>
      </ul>

      <h2 style={{ fontSize: 20, fontWeight: 600, marginTop: 40, marginBottom: 12 }}>3. Data Sharing</h2>
      <p>We do not sell your data or your customers' data to third parties. We share data only as necessary to operate the service:</p>
      <ul style={{ paddingLeft: 24 }}>
        <li><strong>Meta (Facebook):</strong> We send conversion events via the Conversions API on your instruction.</li>
        <li><strong>Google:</strong> We read ad performance data from your connected Google Ads account.</li>
        <li><strong>Email delivery:</strong> Newsletter emails are sent using our email infrastructure on your behalf.</li>
      </ul>

      <h2 style={{ fontSize: 20, fontWeight: 600, marginTop: 40, marginBottom: 12 }}>4. Data Retention</h2>
      <p>We retain data for as long as your store has Attribix installed. When you uninstall the app, we delete all store and customer data within 48 hours in accordance with Shopify's GDPR requirements.</p>

      <h2 style={{ fontSize: 20, fontWeight: 600, marginTop: 40, marginBottom: 12 }}>5. GDPR &amp; Customer Rights</h2>
      <p>If you or your customers are located in the European Union, you have the right to access, correct, or request deletion of personal data. We support Shopify's mandatory GDPR webhooks for customer data requests and deletions. Contact us at <a href="mailto:privacy@attribix.com" style={{ color: "#4f46e5" }}>privacy@attribix.com</a> for any data requests.</p>

      <h2 style={{ fontSize: 20, fontWeight: 600, marginTop: 40, marginBottom: 12 }}>6. Security</h2>
      <p>All data is transmitted over HTTPS. We store data in encrypted databases hosted on Fly.io infrastructure in the EU. Access tokens for connected ad accounts are encrypted at rest.</p>

      <h2 style={{ fontSize: 20, fontWeight: 600, marginTop: 40, marginBottom: 12 }}>7. Contact</h2>
      <p>For privacy-related questions, contact us at:<br />
        <a href="mailto:privacy@attribix.com" style={{ color: "#4f46e5" }}>privacy@attribix.com</a>
      </p>
    </div>
  );
}
