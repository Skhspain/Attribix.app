// app/utils/http.server.ts
export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, x-api-key",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
} as const;

export function corsPreflight(request: Request) {
  if (request.method.toUpperCase() === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  return null;
}

export function assertApiKey(request: Request) {
  const supplied =
    request.headers.get("x-api-key") ||
    new URL(request.url).searchParams.get("key");
  const expected = process.env.INTERNAL_API_KEY;
  if (!expected || supplied !== expected) {
    throw new Response("Unauthorized", { status: 401 });
  }
}
