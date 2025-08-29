export function getBaseUrl(request: Request) {
  // Prefer the configured public URL in prod
  if (process.env.SHOPIFY_APP_URL) return process.env.SHOPIFY_APP_URL;
  const u = new URL(request.url);
  return `${u.protocol}//${u.host}`;
}
