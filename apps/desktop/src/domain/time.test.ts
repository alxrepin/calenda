import { describe, expect, it } from "vitest";
import {
  addDays,
  addMonths,
  daysBetween,
  formatRelativeDay,
  monthGrid,
  rangeForDays,
  snapMinutes,
  startOfWeek,
  stepAnchor,
  toIsoDate,
  visibleDays,
  weekDays,
  weekdayIndex,
} from "./time";

describe("civil date arithmetic", () => {
  it("adds days across month and year boundaries", () => {
    expect(addDays("2026-09-30", 1)).toBe("2026-10-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("adds months clamping the day", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2026-09-30", 1)).toBe("2026-10-30");
    expect(addMonths("2026-01-15", -1)).toBe("2025-12-15");
  });

  it("starts weeks on Monday", () => {
    expect(weekdayIndex("2026-09-28")).toBe(0); // Monday
    expect(weekdayIndex("2026-10-04")).toBe(6); // Sunday
    expect(startOfWeek("2026-09-30")).toBe("2026-09-28");
    expect(weekDays("2026-10-04")[0]).toBe("2026-09-28");
    expect(weekDays("2026-10-04")).toHaveLength(7);
  });

  it("builds a six-row month grid starting on the week of the 1st", () => {
    const grid = monthGrid("2026-09-30");
    expect(grid).toHaveLength(6);
    expect(grid[0]?.[0]).toBe("2026-08-31");
    expect(grid[4]?.[1]).toBe("2026-09-29");
    expect(grid[5]?.[6]).toBe("2026-10-11");
  });

  it("computes the query window from visible days", () => {
    const days = visibleDays("week", "2026-09-30");
    const range = rangeForDays(days);
    expect(toIsoDate(range.start)).toBe("2026-09-28");
    expect(range.start.getHours()).toBe(0);
    expect(toIsoDate(range.end)).toBe("2026-10-05");
    expect(daysBetween("2026-09-28", "2026-10-05")).toBe(7);
  });

  it("steps anchors by view", () => {
    expect(stepAnchor("day", "2026-09-30", 1)).toBe("2026-10-01");
    expect(stepAnchor("week", "2026-09-30", -1)).toBe("2026-09-23");
    expect(stepAnchor("month", "2026-09-30", 1)).toBe("2026-10-30");
  });

  it("snaps to quarter hours within the day", () => {
    expect(snapMinutes(7)).toBe(0);
    expect(snapMinutes(8)).toBe(15);
    expect(snapMinutes(24 * 60 + 30)).toBe(24 * 60);
  });

  it("names relative days", () => {
    expect(formatRelativeDay("2026-09-30", "2026-09-30")).toBe("Today");
    expect(formatRelativeDay("2026-10-01", "2026-09-30")).toBe("Tomorrow");
    expect(formatRelativeDay("2026-09-29", "2026-09-30")).toBe("Yesterday");
    expect(formatRelativeDay("2026-10-02", "2026-09-30")).toMatch(/Oct/);
  });
});
