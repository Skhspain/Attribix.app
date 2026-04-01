import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { authenticate } from "~/shopify.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const shop = session.shop; // e.g. "xyz.myshopify.com"

  try {
    const result = await scanStorefrontStyle(shop);
    return json({ ok: true, ...result });
  } catch (err: any) {
    return json({ ok: false, error: err?.message ?? String(err) });
  }
}

async function scanStorefrontStyle(shop: string) {
  // Fetch storefront HTML (timeout 8s)
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  const res = await fetch(`https://${shop}`, {
    signal: controller.signal,
    headers: { "User-Agent": "Mozilla/5.0 (compatible; Attribix/1.0)" },
  });
  clearTimeout(timeout);

  const html = await res.text();

  // Collect all CSS: inline <style> tags + first 3 external stylesheets
  let allCss = "";

  // Extract <style> tag content
  const styleMatches = html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi);
  for (const m of styleMatches) allCss += m[1] + "\n";

  // Find <link rel="stylesheet" href="..."> and fetch up to 3
  const linkMatches = [...html.matchAll(/<link[^>]+rel=["']stylesheet["'][^>]+href=["']([^"']+)["']/gi)];
  const cssUrls = linkMatches
    .map(m => m[1])
    .filter(u => !u.includes("fonts.googleapis"))
    .slice(0, 3);

  await Promise.all(
    cssUrls.map(async (u) => {
      try {
        const absUrl = u.startsWith("http") ? u : `https://${shop}${u}`;
        const ctrl = new AbortController();
        setTimeout(() => ctrl.abort(), 5000);
        const r = await fetch(absUrl, { signal: ctrl.signal });
        if (r.ok) allCss += await r.text();
      } catch {}
    })
  );

  // ── Extract CSS custom properties from :root blocks ──
  const cssVars: Record<string, string> = {};
  const rootBlocks = allCss.matchAll(/:root\s*\{([^}]+)\}/g);
  for (const block of rootBlocks) {
    const varMatches = block[1].matchAll(/--([a-zA-Z0-9-_]+)\s*:\s*([^;]+);/g);
    for (const v of varMatches) {
      cssVars[`--${v[1].trim()}`] = v[2].trim();
    }
  }

  // ── Helper: parse color value to hex ──
  function toHex(val: string): string | null {
    if (!val) return null;
    val = val.trim();
    // Already hex
    if (/^#[0-9a-f]{3,8}$/i.test(val)) return val.slice(0, 7);
    // rgb(r,g,b) or "r, g, b" (Dawn theme format)
    const rgbMatch = val.match(/^(\d{1,3})[,\s]+(\d{1,3})[,\s]+(\d{1,3})$/);
    if (rgbMatch) {
      const [, r, g, b] = rgbMatch;
      return "#" + [r, g, b].map(x => parseInt(x).toString(16).padStart(2, "0")).join("");
    }
    // rgb(r, g, b) with parens
    const rgbFn = val.match(/rgb\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/);
    if (rgbFn) {
      return "#" + [rgbFn[1], rgbFn[2], rgbFn[3]].map(x => parseInt(x).toString(16).padStart(2, "0")).join("");
    }
    return null;
  }

  // ── Resolve var() references in cssVars ──
  function resolveVar(key: string, depth = 0): string | null {
    if (depth > 5) return null;
    const val = cssVars[key];
    if (!val) return null;
    const varRef = val.match(/var\((--[a-zA-Z0-9-_]+)\)/);
    if (varRef) return resolveVar(varRef[1], depth + 1);
    return val;
  }

  // ── Detect button color ──
  // Priority: Dawn vars > generic button vars > fallback
  const buttonColorCandidates = [
    "--color-button",
    "--color-accent-1",
    "--color-accent",
    "--color-primary",
    "--button-background",
    "--btn-bg-color",
    "--color-base-accent-1",
    "--colorButton",
    "--primary-button-background",
  ];

  let rawButtonColor = "";
  for (const key of buttonColorCandidates) {
    const resolved = resolveVar(key);
    if (resolved) { rawButtonColor = resolved; break; }
  }

  // Also try to find button background color from CSS rules if no var found
  if (!rawButtonColor) {
    // Look for .btn { background[-color]: ...; } or button { background: ...; }
    const btnBgMatch = allCss.match(/(?:\.btn|button)\s*\{[^}]*background(?:-color)?\s*:\s*([^;}\n]+)/i);
    if (btnBgMatch) rawButtonColor = btnBgMatch[1].trim();
  }

  const buttonColor = toHex(rawButtonColor) || "#1a1a1a";

  // ── Detect button text color ──
  const textColorCandidates = [
    "--color-button-text",
    "--color-button-text-1",
    "--btn-text-color",
    "--button-text",
    "--primary-button-text",
  ];
  let rawTextColor = "";
  for (const key of textColorCandidates) {
    const resolved = resolveVar(key);
    if (resolved) { rawTextColor = resolved; break; }
  }
  // If button is dark, text should be white; if light, dark
  const textColor = toHex(rawTextColor) || (isDark(buttonColor) ? "#ffffff" : "#111111");

  // ── Detect border radius ──
  const radiusCandidates = [
    "--buttons--border-radius",
    "--button-border-radius",
    "--border-radius-button",
    "--button-radius",
    "--btn-border-radius",
  ];
  let borderRadius = 4;
  for (const key of radiusCandidates) {
    const resolved = resolveVar(key);
    if (resolved) {
      const num = parseFloat(resolved);
      if (!isNaN(num)) { borderRadius = Math.round(num); break; }
    }
  }

  // ── Detect font family ──
  const fontCandidates = [
    "--font-body-family",
    "--font-heading-family",
    "--body-font-family",
    "--base-font-family",
  ];
  let fontFamily = "";
  for (const key of fontCandidates) {
    const resolved = resolveVar(key);
    if (resolved) { fontFamily = resolved.replace(/['"]/g, "").split(",")[0].trim(); break; }
  }
  if (!fontFamily) {
    const bodyFontMatch = allCss.match(/body\s*\{[^}]*font-family\s*:\s*([^;}\n]+)/i);
    if (bodyFontMatch) fontFamily = bodyFontMatch[1].replace(/['"]/g, "").split(",")[0].trim();
  }

  // ── Detect background/surface color ──
  const bgCandidates = ["--color-background-1", "--color-background", "--background-color", "--bg-color"];
  let backgroundColor = "#ffffff";
  for (const key of bgCandidates) {
    const resolved = resolveVar(key);
    if (resolved) { backgroundColor = toHex(resolved) || "#ffffff"; break; }
  }

  // ── Detect accent/highlight color ──
  const accentCandidates = [
    "--color-accent-2", "--color-accent-3", "--color-secondary", "--color-highlight",
  ];
  let accentColor = "";
  for (const key of accentCandidates) {
    const resolved = resolveVar(key);
    if (resolved) { accentColor = toHex(resolved) || ""; break; }
  }

  return {
    buttonColor,
    textColor,
    borderRadius,
    fontFamily: fontFamily || null,
    backgroundColor,
    accentColor: accentColor || null,
    cssVarsDetected: Object.keys(cssVars).length,
    themeHint: detectTheme(cssVars),
  };
}

// Determine if a hex color is dark (for auto text color)
function isDark(hex: string): boolean {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 < 128;
}

// Guess the theme from detected CSS vars
function detectTheme(vars: Record<string, string>): string {
  if (vars["--color-button"] !== undefined && vars["--font-body-family"] !== undefined) return "Dawn";
  if (vars["--colorButton"] !== undefined) return "Debut";
  if (vars["--color-primary"] !== undefined) return "Impulse";
  if (vars["--btn-bg-color"] !== undefined) return "Turbo";
  return "Unknown";
}
