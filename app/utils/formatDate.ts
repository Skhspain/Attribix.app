// One format for timestamps across the app, always with its timezone.
// Rendered in UTC so the server and the browser produce the same text (and
// two pages never show the same sync at different times).

const DATE_TIME = new Intl.DateTimeFormat("en-GB", {
  day: "numeric", month: "short", year: "numeric",
  hour: "2-digit", minute: "2-digit", timeZone: "UTC",
});

const DATE = new Intl.DateTimeFormat("en-GB", {
  day: "numeric", month: "short", year: "numeric", timeZone: "UTC",
});

function toDate(v: string | number | Date | null | undefined): Date | null {
  if (v === null || v === undefined || v === "") return null;
  const d = v instanceof Date ? v : new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

/** "30 Sept 2026, 14:05 UTC", or `fallback` when there's no valid date. */
export function formatDateTime(v: string | number | Date | null | undefined, fallback = "—"): string {
  const d = toDate(v);
  return d ? `${DATE_TIME.format(d)} UTC` : fallback;
}

/** "30 Sept 2026", or `fallback` when there's no valid date. */
export function formatDate(v: string | number | Date | null | undefined, fallback = "—"): string {
  const d = toDate(v);
  return d ? DATE.format(d) : fallback;
}
