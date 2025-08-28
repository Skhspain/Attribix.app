const ORIGIN = process.env.REPORTS_ALLOW_ORIGIN || "*";
const API_KEY = process.env.REPORTS_API_KEY || "";

export function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": ORIGIN,
    "Access-Control-Allow-Headers": "content-type,x-attribix-key",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  };
}

export function withCors(status = 200, body?: any) {
  return new Response(body ? JSON.stringify(body) : null, {
    status,
    headers: {
      "content-type": "application/json",
      ...corsHeaders(),
    },
  });
}

export function assertApiKey(request: Request) {
  if (!API_KEY) return; // disabled
  const key = request.headers.get("x-attribix-key");
  if (key !== API_KEY) {
    throw new Response("Unauthorized", { status: 401, headers: corsHeaders() });
  }
}
