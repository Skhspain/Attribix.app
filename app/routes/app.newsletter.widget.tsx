// app/routes/app.newsletter.widget.tsx
// Signup form widget builder — renders inside newsletter layout.

import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { authenticate } from "~/shopify.server";
import { useState, useCallback } from "react";
import {
  Card, BlockStack, InlineStack, Text, Button, Badge, Grid, Box, TextField, Select,
} from "@shopify/polaris";

export async function loader({ request }: LoaderFunctionArgs) {
  await authenticate.admin(request);
  return json({});
}

type WidgetTemplate = {
  id: string;
  name: string;
  type: "popup" | "inline" | "slide-in" | "banner";
  description: string;
};

const WIDGET_TEMPLATES: WidgetTemplate[] = [
  { id: "popup_classic", name: "Classic Popup", type: "popup", description: "Centered modal with email input" },
  { id: "popup_dark", name: "Dark Popup", type: "popup", description: "High-contrast dark modal" },
  { id: "popup_split", name: "Split Popup", type: "popup", description: "Image left, form right" },
  { id: "inline_clean", name: "Clean Inline", type: "inline", description: "Simple single-line form" },
  { id: "inline_card", name: "Card Inline", type: "inline", description: "Card with headline and form" },
  { id: "inline_twocol", name: "Two-column", type: "inline", description: "Text left, form right" },
  { id: "slidein_corner", name: "Corner Slide-in", type: "slide-in", description: "Slides in from bottom-right" },
  { id: "slidein_panel", name: "Side Panel", type: "slide-in", description: "Slides in from the right edge" },
  { id: "banner_top", name: "Top Bar", type: "banner", description: "Sticky bar at the top" },
  { id: "banner_bottom", name: "Bottom Bar", type: "banner", description: "Sticky bar at the bottom" },
];

function renderWidgetPreview(
  template: WidgetTemplate,
  colors: { bg: string; btn: string; btnText: string; radius: number; font: string; btnLabel: string }
): string {
  const templates: Record<string, string> = {
    popup_classic: `<div style="width:320px;background:#fff;border-radius:{radius}px;box-shadow:0 8px 32px rgba(0,0,0,0.18);padding:32px 24px;text-align:center;font-family:{font};">
  <p style="margin:0 0 4px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:2px;color:#9ca3af;">Newsletter</p>
  <h2 style="margin:0 0 8px;font-size:22px;font-weight:800;color:#111827;">Stay in the loop</h2>
  <p style="margin:0 0 20px;font-size:13px;color:#6b7280;line-height:1.5;">Get exclusive deals and first look at new arrivals.</p>
  <input type="email" placeholder="Your email address" style="width:100%;box-sizing:border-box;padding:10px 14px;border:1.5px solid #e5e7eb;border-radius:{radius}px;font-size:14px;margin-bottom:10px;outline:none;">
  <button style="width:100%;background:{btn};color:{btnText};border:none;border-radius:{radius}px;padding:11px;font-size:14px;font-weight:700;cursor:pointer;">{btnLabel}</button>
  <p style="margin:12px 0 0;font-size:11px;color:#9ca3af;">No spam. Unsubscribe any time.</p>
</div>`,
    popup_dark: `<div style="width:320px;background:#111827;border-radius:{radius}px;box-shadow:0 8px 32px rgba(0,0,0,0.4);padding:32px 24px;text-align:center;font-family:{font};">
  <p style="margin:0 0 4px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:2.5px;color:#6b7280;">Exclusive access</p>
  <h2 style="margin:0 0 10px;font-size:22px;font-weight:900;color:#ffffff;">Join the inner circle</h2>
  <p style="margin:0 0 20px;font-size:13px;color:#9ca3af;line-height:1.5;">Members-only deals, early drops, and real updates.</p>
  <input type="email" placeholder="Enter your email" style="width:100%;box-sizing:border-box;padding:10px 14px;border:1.5px solid #374151;background:#1f2937;color:#fff;border-radius:{radius}px;font-size:14px;margin-bottom:10px;outline:none;">
  <button style="width:100%;background:{btn};color:{btnText};border:none;border-radius:{radius}px;padding:11px;font-size:14px;font-weight:700;cursor:pointer;">{btnLabel}</button>
</div>`,
    popup_split: `<div style="width:320px;display:flex;border-radius:{radius}px;overflow:hidden;box-shadow:0 8px 32px rgba(0,0,0,0.18);font-family:{font};">
  <div style="width:130px;background:{btn};padding:24px 16px;display:flex;flex-direction:column;justify-content:center;">
    <p style="margin:0 0 6px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:2px;color:{btnText};opacity:0.7;">Exclusive</p>
    <h3 style="margin:0;font-size:18px;font-weight:900;color:{btnText};line-height:1.2;">Join &amp; Save 10%</h3>
  </div>
  <div style="flex:1;background:#fff;padding:20px 16px;">
    <p style="margin:0 0 12px;font-size:12px;color:#6b7280;line-height:1.4;">Subscribe for exclusive deals.</p>
    <input type="email" placeholder="Email" style="width:100%;box-sizing:border-box;padding:8px 10px;border:1.5px solid #e5e7eb;border-radius:{radius}px;font-size:13px;margin-bottom:8px;outline:none;">
    <button style="width:100%;background:{btn};color:{btnText};border:none;border-radius:{radius}px;padding:9px;font-size:13px;font-weight:700;cursor:pointer;">{btnLabel}</button>
  </div>
</div>`,
    inline_clean: `<div style="width:320px;padding:16px;font-family:{font};">
  <p style="margin:0 0 10px;font-size:13px;color:#374151;font-weight:600;">Subscribe to our newsletter</p>
  <div style="display:flex;gap:8px;">
    <input type="email" placeholder="Email address" style="flex:1;padding:10px 14px;border:1.5px solid #e5e7eb;border-radius:{radius}px;font-size:14px;outline:none;">
    <button style="background:{btn};color:{btnText};border:none;border-radius:{radius}px;padding:10px 18px;font-size:14px;font-weight:600;cursor:pointer;white-space:nowrap;">{btnLabel}</button>
  </div>
</div>`,
    inline_card: `<div style="width:320px;background:#fff;border:1.5px solid #e5e7eb;border-radius:{radius}px;padding:24px;font-family:{font};">
  <h3 style="margin:0 0 6px;font-size:18px;font-weight:800;color:#111827;">Get the good stuff</h3>
  <p style="margin:0 0 16px;font-size:13px;color:#6b7280;line-height:1.5;">New arrivals, exclusive offers, and stories worth reading.</p>
  <input type="email" placeholder="you@example.com" style="width:100%;box-sizing:border-box;padding:10px 14px;border:1.5px solid #e5e7eb;border-radius:{radius}px;font-size:14px;margin-bottom:8px;outline:none;">
  <button style="width:100%;background:{btn};color:{btnText};border:none;border-radius:{radius}px;padding:11px;font-size:14px;font-weight:700;cursor:pointer;">{btnLabel}</button>
</div>`,
    inline_twocol: `<div style="width:320px;background:{btn};border-radius:{radius}px;overflow:hidden;font-family:{font};">
  <div style="display:flex;align-items:center;padding:20px 16px;gap:16px;">
    <div style="flex:0 0 120px;">
      <h3 style="margin:0 0 4px;font-size:15px;font-weight:800;color:{btnText};">Don't miss out</h3>
      <p style="margin:0;font-size:12px;color:{btnText};opacity:0.75;line-height:1.4;">Join 1,000+ subscribers</p>
    </div>
    <div style="flex:1;">
      <input type="email" placeholder="Email" style="width:100%;box-sizing:border-box;padding:8px 10px;border:1.5px solid rgba(255,255,255,0.3);background:rgba(255,255,255,0.15);color:#fff;border-radius:{radius}px;font-size:13px;margin-bottom:6px;outline:none;">
      <button style="width:100%;background:#fff;color:{btn};border:none;border-radius:{radius}px;padding:8px;font-size:13px;font-weight:700;cursor:pointer;">{btnLabel}</button>
    </div>
  </div>
</div>`,
    slidein_corner: `<div style="width:280px;background:#fff;border-radius:{radius}px;box-shadow:0 8px 40px rgba(0,0,0,0.22);padding:20px;font-family:{font};position:relative;">
  <div style="position:absolute;top:12px;right:12px;width:20px;height:20px;background:#f3f4f6;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px;color:#9ca3af;cursor:pointer;">✕</div>
  <p style="margin:0 0 4px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:2px;color:{btn};">Quick sign-up</p>
  <h3 style="margin:0 0 8px;font-size:16px;font-weight:800;color:#111827;">Get 10% off your first order</h3>
  <p style="margin:0 0 14px;font-size:12px;color:#6b7280;">Enter your email and we'll send your discount code.</p>
  <input type="email" placeholder="Email address" style="width:100%;box-sizing:border-box;padding:9px 12px;border:1.5px solid #e5e7eb;border-radius:{radius}px;font-size:13px;margin-bottom:8px;outline:none;">
  <button style="width:100%;background:{btn};color:{btnText};border:none;border-radius:{radius}px;padding:10px;font-size:13px;font-weight:700;cursor:pointer;">{btnLabel}</button>
</div>`,
    slidein_panel: `<div style="width:300px;background:#fff;border-radius:{radius}px;box-shadow:0 8px 40px rgba(0,0,0,0.2);overflow:hidden;font-family:{font};">
  <div style="background:{btn};padding:20px 20px 16px;">
    <p style="margin:0 0 4px;font-size:10px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:{btnText};opacity:0.75;">Newsletter</p>
    <h3 style="margin:0;font-size:18px;font-weight:800;color:{btnText};">Stay in the know</h3>
  </div>
  <div style="padding:20px;">
    <p style="margin:0 0 14px;font-size:13px;color:#6b7280;line-height:1.5;">Get the latest news, products, and exclusive deals straight to your inbox.</p>
    <input type="email" placeholder="Your email" style="width:100%;box-sizing:border-box;padding:10px 12px;border:1.5px solid #e5e7eb;border-radius:{radius}px;font-size:13px;margin-bottom:8px;outline:none;">
    <button style="width:100%;background:{btn};color:{btnText};border:none;border-radius:{radius}px;padding:11px;font-size:14px;font-weight:700;cursor:pointer;">{btnLabel}</button>
    <p style="margin:10px 0 0;font-size:11px;color:#9ca3af;text-align:center;">No spam. Unsubscribe any time.</p>
  </div>
</div>`,
    banner_top: `<div style="width:320px;background:{btn};padding:10px 16px;display:flex;align-items:center;gap:12px;font-family:{font};border-radius:{radius}px;">
  <p style="margin:0;font-size:12px;font-weight:600;color:{btnText};white-space:nowrap;flex:0 0 auto;">📢 Join our newsletter</p>
  <input type="email" placeholder="Your email" style="flex:1;min-width:0;padding:7px 10px;border:none;border-radius:{radius}px;font-size:12px;outline:none;background:rgba(255,255,255,0.9);">
  <button style="background:#fff;color:{btn};border:none;border-radius:{radius}px;padding:7px 14px;font-size:12px;font-weight:700;cursor:pointer;white-space:nowrap;flex:0 0 auto;">Subscribe</button>
</div>`,
    banner_bottom: `<div style="width:320px;background:#1a1a2e;padding:12px 16px;display:flex;align-items:center;gap:12px;font-family:{font};border-radius:{radius}px;border-top:3px solid {btn};">
  <div style="flex:1;">
    <p style="margin:0 0 1px;font-size:11px;font-weight:700;color:{btn};text-transform:uppercase;letter-spacing:1px;">Stay updated</p>
    <p style="margin:0;font-size:11px;color:#94a3b8;">Get deals and new drops first.</p>
  </div>
  <input type="email" placeholder="Email" style="flex:1;min-width:0;padding:7px 10px;border:none;border-radius:{radius}px;font-size:12px;outline:none;">
  <button style="background:{btn};color:{btnText};border:none;border-radius:{radius}px;padding:7px 14px;font-size:12px;font-weight:700;cursor:pointer;white-space:nowrap;flex:0 0 auto;">Join</button>
</div>`,
  };

  let html = templates[template.id] ?? `<div style="padding:20px;font-family:sans-serif;color:#888;">Preview unavailable</div>`;
  return html
    .replace(/\{btn\}/g, colors.btn)
    .replace(/\{btnText\}/g, colors.btnText)
    .replace(/\{bg\}/g, colors.bg)
    .replace(/\{radius\}/g, String(colors.radius))
    .replace(/\{font\}/g, colors.font)
    .replace(/\{btnLabel\}/g, colors.btnLabel);
}

function generateEmbedCode(
  template: WidgetTemplate,
  shop: string,
  colors: { btn: string; btnText: string; radius: number; font: string; btnLabel: string }
): string {
  const baseUrl = "https://attribix-app.fly.dev";

  if (template.type === "popup") {
    return `<!-- Attribix Newsletter Popup (${template.name}) -->
<script>
(function() {
  var style = document.createElement('style');
  style.textContent = '.atbx-overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9999;align-items:center;justify-content:center}.atbx-overlay.open{display:flex}.atbx-box{background:#fff;border-radius:${colors.radius}px;padding:32px 24px;max-width:400px;width:90%;text-align:center;font-family:${colors.font}}';
  document.head.appendChild(style);

  var overlay = document.createElement('div');
  overlay.className = 'atbx-overlay';
  overlay.innerHTML = '<div class="atbx-box"><h2 style="margin:0 0 8px;font-size:22px;font-weight:800;color:#111827;">Stay in the loop</h2><p style="margin:0 0 20px;font-size:13px;color:#6b7280;">Get exclusive deals and first look at new arrivals.</p><input id="atbx-email" type="email" placeholder="Your email address" style="width:100%;box-sizing:border-box;padding:10px 14px;border:1.5px solid #e5e7eb;border-radius:${colors.radius}px;font-size:14px;margin-bottom:10px;outline:none;"><button onclick="atbxSubmit()" style="width:100%;background:${colors.btn};color:${colors.btnText};border:none;border-radius:${colors.radius}px;padding:11px;font-size:14px;font-weight:700;cursor:pointer;">${colors.btnLabel}</button><p style="margin:12px 0 0;font-size:11px;color:#9ca3af;">No spam. Unsubscribe any time. <a onclick="this.closest(\\'.atbx-overlay\\').classList.remove(\\'open\\')" style="cursor:pointer;color:#9ca3af;">Close</a></p></div>';
  document.body.appendChild(overlay);

  window.atbxSubmit = function() {
    var email = document.getElementById('atbx-email').value;
    if (!email) return;
    fetch('${baseUrl}/api/newsletter/subscribe', {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ shop: '${shop}', email: email, source: 'popup' })
    }).then(function() {
      overlay.querySelector('.atbx-box').innerHTML = '<p style="font-size:16px;font-weight:700;color:#008060;">✓ You\\'re subscribed!</p>';
      setTimeout(function(){ overlay.classList.remove('open'); }, 2000);
    });
  };

  // Show after 5 seconds
  setTimeout(function() { overlay.classList.add('open'); }, 5000);
})();
<\/script>`;
  }

  if (template.type === "inline") {
    return `<!-- Attribix Newsletter Inline Form (${template.name}) -->
<div id="atbx-inline" style="padding:24px;background:#fff;border:1.5px solid #e5e7eb;border-radius:${colors.radius}px;font-family:${colors.font};">
  <h3 style="margin:0 0 6px;font-size:18px;font-weight:800;color:#111827;">Get the good stuff</h3>
  <p style="margin:0 0 16px;font-size:13px;color:#6b7280;">New arrivals, exclusive offers, and stories worth reading.</p>
  <div style="display:flex;gap:8px;">
    <input id="atbx-email" type="email" placeholder="Your email" style="flex:1;padding:10px 14px;border:1.5px solid #e5e7eb;border-radius:${colors.radius}px;font-size:14px;outline:none;">
    <button onclick="atbxSubmit()" style="background:${colors.btn};color:${colors.btnText};border:none;border-radius:${colors.radius}px;padding:10px 18px;font-size:14px;font-weight:700;cursor:pointer;">${colors.btnLabel}</button>
  </div>
  <p id="atbx-msg" style="margin:8px 0 0;font-size:12px;color:#6b7280;"></p>
</div>
<script>
window.atbxSubmit = function() {
  var email = document.getElementById('atbx-email').value;
  if (!email) return;
  fetch('${baseUrl}/api/newsletter/subscribe', {
    method: 'POST', headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ shop: '${shop}', email: email, source: 'inline_form' })
  }).then(function() {
    document.getElementById('atbx-msg').textContent = '✓ Subscribed! Thank you.';
    document.getElementById('atbx-msg').style.color = '#008060';
    document.getElementById('atbx-email').value = '';
  });
};
<\/script>`;
  }

  if (template.type === "slide-in") {
    return `<!-- Attribix Newsletter Slide-in (${template.name}) -->
<style>
#atbx-slidein{position:fixed;bottom:24px;right:24px;z-index:9999;width:300px;background:#fff;border-radius:${colors.radius}px;box-shadow:0 8px 40px rgba(0,0,0,0.22);transform:translateX(360px);transition:transform 0.4s ease;font-family:${colors.font};}
#atbx-slidein.open{transform:translateX(0);}
</style>
<div id="atbx-slidein">
  <div style="background:${colors.btn};padding:16px 20px;border-radius:${colors.radius}px ${colors.radius}px 0 0;">
    <h3 style="margin:0;font-size:17px;font-weight:800;color:${colors.btnText};">Stay in the know</h3>
  </div>
  <div style="padding:18px 20px;">
    <p style="margin:0 0 12px;font-size:13px;color:#6b7280;">Get deals and new drops first.</p>
    <input id="atbx-email" type="email" placeholder="Your email" style="width:100%;box-sizing:border-box;padding:9px 12px;border:1.5px solid #e5e7eb;border-radius:${colors.radius}px;font-size:13px;margin-bottom:8px;outline:none;">
    <button onclick="atbxSubmit()" style="width:100%;background:${colors.btn};color:${colors.btnText};border:none;border-radius:${colors.radius}px;padding:10px;font-size:13px;font-weight:700;cursor:pointer;">${colors.btnLabel}</button>
    <p style="margin:8px 0 0;font-size:11px;color:#9ca3af;text-align:center;"><a onclick="document.getElementById('atbx-slidein').classList.remove('open')" style="cursor:pointer;color:#9ca3af;">No thanks</a></p>
  </div>
</div>
<script>
setTimeout(function(){ document.getElementById('atbx-slidein').classList.add('open'); }, 8000);
window.atbxSubmit = function() {
  var email = document.getElementById('atbx-email').value;
  if (!email) return;
  fetch('${baseUrl}/api/newsletter/subscribe', {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ shop:'${shop}', email: email, source: 'slide_in' })
  }).then(function() {
    document.getElementById('atbx-slidein').innerHTML = '<div style="padding:24px;text-align:center;"><p style="font-size:16px;font-weight:700;color:#008060;">✓ Subscribed!</p></div>';
    setTimeout(function(){ document.getElementById('atbx-slidein').classList.remove('open'); }, 2000);
  });
};
<\/script>`;
  }

  // banner
  const pos = template.id === "banner_top" ? "top:0" : "bottom:0";
  return `<!-- Attribix Newsletter Banner (${template.name}) -->
<style>
#atbx-banner{position:fixed;${pos};left:0;right:0;z-index:9999;background:${colors.btn};padding:10px 24px;display:flex;align-items:center;gap:16px;font-family:${colors.font};}
</style>
<div id="atbx-banner">
  <p style="margin:0;font-size:13px;font-weight:600;color:${colors.btnText};white-space:nowrap;">📢 Join our newsletter</p>
  <input id="atbx-email" type="email" placeholder="Your email" style="flex:1;max-width:280px;padding:7px 12px;border:none;border-radius:${colors.radius}px;font-size:13px;outline:none;">
  <button onclick="atbxSubmit()" style="background:#fff;color:${colors.btn};border:none;border-radius:${colors.radius}px;padding:7px 18px;font-size:13px;font-weight:700;cursor:pointer;white-space:nowrap;">${colors.btnLabel}</button>
  <a onclick="document.getElementById('atbx-banner').style.display='none'" style="color:${colors.btnText};opacity:0.6;cursor:pointer;font-size:18px;line-height:1;">✕</a>
</div>
<script>
window.atbxSubmit = function() {
  var email = document.getElementById('atbx-email').value;
  if (!email) return;
  fetch('${baseUrl}/api/newsletter/subscribe', {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ shop:'${shop}', email: email, source: 'banner' })
  }).then(function() {
    document.getElementById('atbx-banner').innerHTML = '<p style="margin:0 auto;font-size:14px;font-weight:700;color:${colors.btnText};">✓ You\\'re subscribed! Thank you.</p>';
    setTimeout(function(){ document.getElementById('atbx-banner').style.display='none'; }, 3000);
  });
};
<\/script>`;
}

export default function NewsletterWidget() {
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [detectedColors, setDetectedColors] = useState({
    btn: "#008060",
    btnText: "#ffffff",
    radius: 6,
    font: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    bg: "#ffffff",
    btnLabel: "Subscribe",
  });
  const [scanned, setScanned] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>("all");
  const [btnLabel, setBtnLabel] = useState("Subscribe");
  const [showCode, setShowCode] = useState(false);

  const handleScan = useCallback(async () => {
    setScanning(true);
    setScanError(null);
    try {
      const res = await fetch("/api/buy-now/scan-style");
      const data = await res.json();
      if (data.ok) {
        setDetectedColors({
          btn: data.buttonColor ?? "#008060",
          btnText: data.textColor ?? "#ffffff",
          radius: data.borderRadius ?? 6,
          font: data.fontFamily ?? "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
          bg: data.backgroundColor ?? "#ffffff",
          btnLabel,
        });
        setScanned(true);
      } else {
        setScanError(data.error ?? "Scan failed");
      }
    } catch (e: any) {
      setScanError(e.message);
    } finally {
      setScanning(false);
    }
  }, [btnLabel]);

  const colors = { ...detectedColors, btnLabel };

  const filteredTemplates = filter === "all"
    ? WIDGET_TEMPLATES
    : WIDGET_TEMPLATES.filter(t => t.type === filter);

  const selectedTemplate = WIDGET_TEMPLATES.find(t => t.id === selectedId);

  const IFRAME_W = 340;
  const IFRAME_H = 200;
  const SCALE = 0.72;
  const CARD_W = Math.round(IFRAME_W * SCALE);
  const CARD_H = Math.round(IFRAME_H * SCALE);

  return (
    <BlockStack gap="500">
      {/* Scan bar */}
      <Card>
        <InlineStack align="space-between" blockAlign="center">
          <BlockStack gap="100">
            <Text as="h2" variant="headingSm">Auto-detect store style</Text>
            <Text as="p" variant="bodySm" tone="subdued">
              We scan your storefront CSS and suggest a matching widget design.
            </Text>
          </BlockStack>
          <Button onClick={handleScan} loading={scanning} variant="secondary">
            {scanning ? "Scanning\u2026" : scanned ? "Re-scan" : "Scan my store"}
          </Button>
        </InlineStack>
        {scanned && !scanError && (
          <div style={{ marginTop: 12, display: "flex", gap: 12, alignItems: "center" }}>
            <div style={{ width: 28, height: 28, background: detectedColors.btn, borderRadius: 6, border: "1px solid #e1e3e5" }} title="Button color" />
            <div style={{ width: 28, height: 28, background: detectedColors.bg, borderRadius: 6, border: "1px solid #e1e3e5" }} title="Background color" />
            <Text as="p" variant="bodySm" tone="subdued">
              Detected: <strong>{detectedColors.btn}</strong> · Radius: {detectedColors.radius}px · Font: {detectedColors.font.split(",")[0]}
            </Text>
          </div>
        )}
        {scanError && <div style={{ marginTop: 10 }}><Text as="p" variant="bodySm" tone="critical">{scanError}</Text></div>}
      </Card>

      {/* Label customiser */}
      <Card>
        <InlineStack gap="400" blockAlign="end">
          <div style={{ flex: 1 }}>
            <TextField
              label="Button label"
              value={btnLabel}
              onChange={setBtnLabel}
              autoComplete="off"
              helpText="This text appears on the subscribe button in all widgets."
            />
          </div>
          <div style={{ flex: 1 }}>
            <Select
              label="Filter by type"
              options={[
                { label: "All types", value: "all" },
                { label: "Popup", value: "popup" },
                { label: "Inline", value: "inline" },
                { label: "Slide-in", value: "slide-in" },
                { label: "Banner", value: "banner" },
              ]}
              value={filter}
              onChange={setFilter}
            />
          </div>
        </InlineStack>
      </Card>

      {/* Template gallery */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 16 }}>
        {filteredTemplates.map((tmpl) => {
          const isSelected = selectedId === tmpl.id;
          const previewHtml = renderWidgetPreview(tmpl, colors);
          const typeColors: Record<string, string> = {
            popup: "#7c3aed",
            inline: "#0891b2",
            "slide-in": "#b45309",
            banner: "#16a34a",
          };
          return (
            <div
              key={tmpl.id}
              onClick={() => setSelectedId(tmpl.id)}
              style={{
                border: isSelected ? "2px solid #008060" : "1.5px solid #e1e3e5",
                borderRadius: 10,
                overflow: "hidden",
                cursor: "pointer",
                background: isSelected ? "#f0fdf4" : "#fff",
                boxShadow: isSelected ? "0 0 0 3px rgba(0,128,96,0.15)" : "none",
                transition: "all 0.15s",
              }}
            >
              {/* Scaled preview */}
              <div
                style={{
                  width: CARD_W,
                  height: CARD_H,
                  overflow: "hidden",
                  position: "relative",
                  background: "#f6f6f7",
                }}
              >
                <iframe
                  srcDoc={`<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="margin:0;padding:0;background:#f6f6f7;display:flex;align-items:center;justify-content:center;min-height:${IFRAME_H}px;">${previewHtml}</body></html>`}
                  style={{
                    width: IFRAME_W,
                    height: IFRAME_H,
                    border: "none",
                    position: "absolute",
                    top: 0,
                    left: 0,
                    transform: `scale(${SCALE})`,
                    transformOrigin: "top left",
                    pointerEvents: "none",
                  }}
                  sandbox="allow-same-origin"
                  title={tmpl.name}
                />
              </div>
              {/* Card footer */}
              <div style={{ padding: "10px 14px 12px", borderTop: "1px solid #e1e3e5" }}>
                <InlineStack align="space-between" blockAlign="center">
                  <BlockStack gap="050">
                    <Text as="p" variant="bodyMd" fontWeight="semibold">{tmpl.name}</Text>
                    <Text as="p" variant="bodySm" tone="subdued">{tmpl.description}</Text>
                  </BlockStack>
                  <span style={{
                    fontSize: 11, fontWeight: 700, textTransform: "uppercase",
                    letterSpacing: "0.5px", color: typeColors[tmpl.type] ?? "#374151",
                    background: typeColors[tmpl.type] + "18",
                    padding: "2px 8px", borderRadius: 4,
                  }}>
                    {tmpl.type}
                  </span>
                </InlineStack>
                {isSelected && (
                  <div style={{ marginTop: 8 }}>
                    <Text as="p" variant="bodySm" tone="success" fontWeight="semibold">✓ Selected</Text>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Embed code panel — shown when a template is selected */}
      {selectedTemplate && (
        <Card>
          <BlockStack gap="300">
            <InlineStack align="space-between" blockAlign="center">
              <BlockStack gap="050">
                <Text as="h2" variant="headingSm">Embed code — {selectedTemplate.name}</Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  Paste this into your Shopify theme where you want the {selectedTemplate.type} to appear.
                </Text>
              </BlockStack>
              <Button variant="secondary" onClick={() => setShowCode(v => !v)}>
                {showCode ? "Hide code" : "Show embed code"}
              </Button>
            </InlineStack>
            {showCode && (
              <>
                <Box background="bg-surface-secondary" borderRadius="200" padding="400">
                  <pre style={{ margin: 0, fontSize: 11, overflowX: "auto", whiteSpace: "pre-wrap", wordBreak: "break-all", lineHeight: 1.6 }}>
                    {generateEmbedCode(selectedTemplate, "YOUR_SHOP.myshopify.com", colors)}
                  </pre>
                </Box>
                <Button
                  variant="plain"
                  onClick={() => navigator.clipboard?.writeText(generateEmbedCode(selectedTemplate, "YOUR_SHOP.myshopify.com", colors))}
                >
                  Copy to clipboard
                </Button>
              </>
            )}
          </BlockStack>
        </Card>
      )}
    </BlockStack>
  );
}
