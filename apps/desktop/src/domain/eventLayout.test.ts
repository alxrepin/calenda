import { describe, expect, it } from "vitest";
import type { CalendarEvent } from "./model";
import { eventsOnDay, layoutAllDayEvents, layoutTimedEvents, timedMinutesOn } from "./eventLayout";

function timed(id: string, start: string, end: string): CalendarEvent {
  return {
    id,
    calendarId: "c",
    title: id,
    time: { kind: "timed", start: new Date(start), end: new Date(end) },
    location: null,
    notes: null,
    url: null,
    isRecurring: false,
    readOnly: false,
  };
}

function allDay(id: string, first: string, last: string): CalendarEvent {
  return { ...timed(id, "2026-01-01T00:00", "2026-01-01T01:00"), time: { kind: "allDay", first, last } };
}

describe("timed layout", () => {
  it("clamps to the day and enforces a minimum height", () => {
    const e = timed("a", "2026-09-29T23:00", "2026-09-30T01:00");
    expect(timedMinutesOn(e, "2026-09-29")).toEqual({ start: 23 * 60, end: 24 * 60 });
    expect(timedMinutesOn(e, "2026-09-30")).toEqual({ start: 0, end: 60 });
    expect(timedMinutesOn(e, "2026-10-01")).toBeNull();
    const tiny = timed("t", "2026-09-30T10:00", "2026-09-30T10:05");
    expect(timedMinutesOn(tiny, "2026-09-30")).toEqual({ start: 600, end: 620 });
  });

  it("puts overlapping events side by side and separates clusters", () => {
    const a = timed("a", "2026-09-30T10:00", "2026-09-30T11:00");
    const b = timed("b", "2026-09-30T10:30", "2026-09-30T11:30");
    const c = timed("c", "2026-09-30T11:00", "2026-09-30T12:00");
    const d = timed("d", "2026-09-30T14:00", "2026-09-30T15:00");
    const placed = layoutTimedEvents([d, c, b, a], "2026-09-30");
    const byId = Object.fromEntries(placed.map((p) => [p.event.id, p]));
    expect(byId.a).toMatchObject({ column: 0, columns: 2 });
    expect(byId.b).toMatchObject({ column: 1, columns: 2 });
    // c starts when a ends, so it reuses column 0 but stays in the cluster with b.
    expect(byId.c).toMatchObject({ column: 0, columns: 2 });
    expect(byId.d).toMatchObject({ column: 0, columns: 1 });
  });
});

describe("all-day layout", () => {
  const days = ["2026-09-28", "2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04"];

  it("spans columns and clips at the edges", () => {
    const vacation = allDay("vac", "2026-09-26", "2026-09-29");
    const berlin = allDay("berlin", "2026-10-03", "2026-10-06");
    const placed = layoutAllDayEvents([berlin, vacation], days);
    expect(placed.find((p) => p.event.id === "vac")).toMatchObject({ startCol: 0, span: 2, clippedStart: true, clippedEnd: false, lane: 0 });
    expect(placed.find((p) => p.event.id === "berlin")).toMatchObject({ startCol: 5, span: 2, clippedEnd: true, lane: 0 });
  });

  it("stacks overlapping bars into lanes and draws multi-day timed events as bars", () => {
    const a = allDay("a", "2026-09-28", "2026-09-30");
    const b = allDay("b", "2026-09-29", "2026-09-29");
    const trip = timed("trip", "2026-10-01T18:00", "2026-10-03T09:00");
    const placed = layoutAllDayEvents([a, b, trip], days);
    expect(placed.find((p) => p.event.id === "a")?.lane).toBe(0);
    expect(placed.find((p) => p.event.id === "b")?.lane).toBe(1);
    expect(placed.find((p) => p.event.id === "trip")).toMatchObject({ startCol: 3, span: 3, lane: 0 });
  });

  it("lists events touching a day with bars first", () => {
    const a = allDay("a", "2026-09-29", "2026-09-30");
    const t = timed("t", "2026-09-30T09:00", "2026-09-30T10:00");
    const midnight = timed("m", "2026-09-29T22:00", "2026-09-30T00:00");
    expect(eventsOnDay([t, a, midnight], "2026-09-30").map((e) => e.id)).toEqual(["a", "t"]);
    expect(eventsOnDay([t, a, midnight], "2026-09-29").map((e) => e.id)).toEqual(["a", "m"]);
  });
});
