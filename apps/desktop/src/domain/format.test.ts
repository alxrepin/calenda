import { describe, expect, it } from "vitest";
import { formatTime, formatTimeCompact, formatTimeRange } from "./time";

describe("time formatting", () => {
  const ten = new Date(2026, 8, 30, 10, 0);
  const half = new Date(2026, 8, 30, 11, 30);
  const evening = new Date(2026, 8, 30, 18, 30);

  it("keeps the locale's day period in full form", () => {
    expect(formatTime(ten)).toMatch(/^10:00( AM)?$/);
  });

  it("drops the period in compact form", () => {
    expect(formatTimeCompact(evening)).toMatch(/^(6|18):30$/);
    expect(formatTimeRange(ten, half)).toMatch(/^10:00–11:30$/);
  });

  it("shares a single period in the long form", () => {
    expect(formatTimeRange(ten, half, false)).toMatch(/^10:00–11:30( AM)?$/);
  });
});
