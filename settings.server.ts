// app/settings.server.ts
export const ALLOW_ORIGIN = process.env.REPORTS_ALLOW_ORIGIN ?? "*";

export function corsHeaders(
  extra: Record<string, string> = {},
  contentType = "application/json; charset=utf-8",
) {
  return {
    "Access-Control-Allow-Origin": ALLOW_ORIGIN,
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
    "Cache-Control": "public, max-age=300",
    "Content-Type": contentType,
    ...extra,
  };
}
