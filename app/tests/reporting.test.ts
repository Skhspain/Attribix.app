import { describe, expect, it, vi } from "vitest";
import { periodStart, previousPeriod } from "~/utils/reportPeriod";

vi.mock("~/db.server", () => ({ default: {}, db: {} }));
const { channelOf, NOT_TRACKED_CHANNEL } = await import("~/services/touchpoints.server");

describe("report periods", () => {
  const now = Date.UTC(2026, 8, 28, 11, 30); // 28 Sept 2026, 11:30 UTC

  it("'last 7 days' is today plus the 6 days before (7 calendar days, not 8)", () => {
    expect(periodStart(7, now).toISOString()).toBe("2026-09-22T00:00:00.000Z");
  });

  it("previous period is the same length and ends where the current one starts", () => {
    const prev = previousPeriod(30, now);
    expect(prev.end.toISOString()).toBe(periodStart(30, now).toISOString());
    expect((prev.end.getTime() - prev.start.getTime()) / 864e5).toBe(30);
  });

  it("matches the day an ad insight row is stored under", () => {
    // Meta/Google insight rows are dated at UTC midnight of their day.
    const firstDayRow = new Date("2026-09-22T00:00:00Z");
    const dayBefore = new Date("2026-09-21T00:00:00Z");
    expect(firstDayRow >= periodStart(7, now)).toBe(true);
    expect(dayBefore >= periodStart(7, now)).toBe(false);
  });
});

describe("journey channels", () => {
  it("treats Google's ppc medium as paid", () => {
    expect(channelOf({ utmSource: "adwords", utmMedium: "ppc" })).toBe("Google Ads");
    expect(channelOf({ utmSource: "google", utmMedium: "ppc" })).toBe("Google Ads");
    expect(channelOf({ utmSource: "facebook", utmMedium: "paid" })).toBe("Meta Ads");
    expect(channelOf({ utmSource: "google", utmMedium: "organic" })).toBe("Organic Search");
  });

  it("calls a seen visit without source 'Direct', distinct from an order we never saw", () => {
    expect(channelOf({})).toBe("Direct");
    expect(NOT_TRACKED_CHANNEL).toBe("Not tracked");
  });
});
