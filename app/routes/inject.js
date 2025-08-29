// app/routes/inject.js
import { json } from "@remix-run/node";

/**
 * @type {import("@remix-run/node").LoaderFunction}
 */
export async function loader() {
  // Read from the same in-memory store (swap for DB in prod)
  const { method, pixelId, snippet } = await import("./app.settings.jsx").then(m => m.settings);

  let code;
  if (method === "pixel") {
    code = `
      !function(f,b,e,v,n,t,s){/* Facebook Pixel loader */}...
      fbq('init','${pixelId}');
      fbq('track','PageView');
    `;
  } else {
    // Merchant’s own snippet, strip outer <script> tags if you like
    code = snippet;
  }

  return new Response(code, {
    headers: { "Content-Type": "application/javascript" },
  });
}
