// ROAS is always shown as a percentage: revenue ÷ spend × 100 (2.5 → "250%").
export function formatRoas(roas: number | null | undefined): string {
  return roas == null || !Number.isFinite(roas) ? "—" : `${Math.round(roas * 100)}%`;
}
