// CORS headers you can reuse in loaders/actions
export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

// Helper to merge CORS into a ResponseInit
export function withCors(init) {
  const base = init || {};
  const merged = new Headers(base.headers || {});
  for (const [k, v] of Object.entries(corsHeaders)) merged.set(k, v);
  return { ...base, headers: merged };
}

// Optional: quick handler for OPTIONS preflight
export function handleCorsPreflight(request) {
  if ((request.method || "GET").toUpperCase() === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  return null;
}
