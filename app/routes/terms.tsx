// app/routes/terms.tsx
// Public terms of service page — required for Meta app review and Shopify app listing.

export default function TermsOfService() {
  return (
    <div style={{ maxWidth: 760, margin: "0 auto", padding: "48px 24px", fontFamily: "system-ui, sans-serif", color: "#111", lineHeight: 1.7 }}>
      <h1 style={{ fontSize: 32, fontWeight: 700, marginBottom: 8 }}>Terms of Service</h1>
      <p style={{ color: "#555", marginBottom: 40 }}>Last updated: April 4, 2026</p>

      <p>By installing or using the Attribix Shopify app ("Service"), you agree to these Terms of Service. Please read them carefully.</p>

      <h2 style={{ fontSize: 20, fontWeight: 600, marginTop: 40, marginBottom: 12 }}>1. Description of Service</h2>
      <p>Attribix provides Shopify merchants with marketing analytics, multi-touch attribution, lead management, newsletter, review management, and SEO tools. The Service integrates with Meta Ads, Google Ads, and the Shopify platform.</p>

      <h2 style={{ fontSize: 20, fontWeight: 600, marginTop: 40, marginBottom: 12 }}>2. Acceptable Use</h2>
      <p>You agree to use Attribix only for lawful purposes in connection with operating your Shopify store. You must not:</p>
      <ul style={{ paddingLeft: 24 }}>
        <li>Use the Service to send unsolicited commercial email (spam)</li>
        <li>Attempt to reverse-engineer, copy, or resell any part of the Service</li>
        <li>Use the Service in a way that violates Meta's, Google's, or Shopify's platform policies</li>
        <li>Share access credentials with unauthorised third parties</li>
      </ul>

      <h2 style={{ fontSize: 20, fontWeight: 600, marginTop: 40, marginBottom: 12 }}>3. Your Data</h2>
      <p>You retain ownership of all data associated with your store. By using Attribix, you grant us a limited licence to process that data solely to provide the Service. See our <a href="/privacy" style={{ color: "#4f46e5" }}>Privacy Policy</a> for details.</p>

      <h2 style={{ fontSize: 20, fontWeight: 600, marginTop: 40, marginBottom: 12 }}>4. Third-Party Integrations</h2>
      <p>Attribix connects to third-party platforms including Meta (Facebook), Google, and Shopify. Your use of those platforms is governed by their own terms and policies. We are not responsible for changes to third-party APIs that affect the Service.</p>

      <h2 style={{ fontSize: 20, fontWeight: 600, marginTop: 40, marginBottom: 12 }}>5. Limitation of Liability</h2>
      <p>The Service is provided "as is" without warranties of any kind. We are not liable for any indirect, incidental, or consequential damages arising from your use of the Service, including loss of revenue or data.</p>

      <h2 style={{ fontSize: 20, fontWeight: 600, marginTop: 40, marginBottom: 12 }}>6. Termination</h2>
      <p>You may stop using the Service at any time by uninstalling the app from your Shopify store. We reserve the right to suspend access if these Terms are violated.</p>

      <h2 style={{ fontSize: 20, fontWeight: 600, marginTop: 40, marginBottom: 12 }}>7. Changes to Terms</h2>
      <p>We may update these Terms from time to time. Continued use of the Service after changes constitutes acceptance of the updated Terms.</p>

      <h2 style={{ fontSize: 20, fontWeight: 600, marginTop: 40, marginBottom: 12 }}>8. Contact</h2>
      <p>Questions about these Terms? Contact us at:<br />
        <a href="mailto:legal@attribix.com" style={{ color: "#4f46e5" }}>legal@attribix.com</a>
      </p>
    </div>
  );
}
