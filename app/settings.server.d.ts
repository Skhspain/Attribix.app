// app/settings.server.d.ts
declare module "./settings.server" {
  export const corsHeaders: Record<string, string>;
  export function withCors(init?: ResponseInit): ResponseInit;
  export function handleCorsPreflight(request: Request): Response | null;
}
