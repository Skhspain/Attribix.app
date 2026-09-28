// app/utils/reportPeriod.ts
// One definition of "last N days" for every report, so Overview, Analytics,
// Meta and Google always cover the same days.
//
// A period of N days is today plus the N-1 days before it, in UTC calendar
// days. Ad platform insights are stored per calendar day at UTC midnight, so
// orders must use the same boundaries or spend and revenue cover different days.

const DAY_MS = 24 * 60 * 60 * 1000;

/** Start (inclusive) of the last `days` calendar days, UTC. */
export function periodStart(days: number, now: Date | number = Date.now()): Date {
  const d = new Date(now);
  d.setUTCHours(0, 0, 0, 0);
  return new Date(d.getTime() - (days - 1) * DAY_MS);
}

/** The `days`-long period immediately before the current one: [start, end). */
export function previousPeriod(days: number, now: Date | number = Date.now()) {
  const end = periodStart(days, now);
  return { start: new Date(end.getTime() - days * DAY_MS), end };
}

/** e.g. "22 Sept – 28 Sept" for labels next to period totals. */
export function periodLabel(days: number, now: Date | number = Date.now()) {
  const fmt = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
  return `${fmt(periodStart(days, now))} – ${fmt(new Date(now))}`;
}
