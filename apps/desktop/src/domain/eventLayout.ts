/**
 * Geometry for the time grid. Pure functions: inputs are events and a day,
 * outputs are fractions/minutes the view turns into pixels.
 */
import type { CalendarEvent, IsoDate } from "./model";
import { addDays, compareIsoDate, daysBetween, localMidnight, minutesSinceMidnight, toIsoDate } from "./time";

export interface TimedPlacement {
  event: CalendarEvent;
  /** Minutes from local midnight where the block starts (clamped to the day). */
  startMinutes: number;
  /** Minutes from local midnight where the block ends (clamped to the day). */
  endMinutes: number;
  /** Column index within its overlap cluster. */
  column: number;
  /** Number of columns in the cluster. */
  columns: number;
}

const MIN_BLOCK_MINUTES = 20;

/** The part of a timed event that falls on `day`, in minutes of that day. */
export function timedMinutesOn(event: CalendarEvent, day: IsoDate): { start: number; end: number } | null {
  if (event.time.kind !== "timed") return null;
  const dayStart = localMidnight(day);
  const dayEnd = localMidnight(addDays(day, 1));
  const { start, end } = event.time;
  if (end <= dayStart || start >= dayEnd) return null;
  const s = start < dayStart ? 0 : minutesSinceMidnight(start);
  const e = end >= dayEnd ? 24 * 60 : minutesSinceMidnight(end);
  return { start: s, end: Math.max(e, s + MIN_BLOCK_MINUTES) };
}

/**
 * Assigns overlapping events to side-by-side columns, the way Calendar.app
 * and Google Calendar do: events are sorted by start, each is put in the
 * first column whose last event ended before it starts, and every event in a
 * connected cluster shares the cluster's column count.
 */
export function layoutTimedEvents(events: CalendarEvent[], day: IsoDate): TimedPlacement[] {
  const items = events
    .map((event) => ({ event, span: timedMinutesOn(event, day) }))
    .filter((x): x is { event: CalendarEvent; span: { start: number; end: number } } => x.span !== null)
    .sort((a, b) => a.span.start - b.span.start || b.span.end - a.span.end || a.event.title.localeCompare(b.event.title));

  const placements: TimedPlacement[] = [];
  let cluster: TimedPlacement[] = [];
  let columnEnds: number[] = [];
  let clusterEnd = -1;

  const flush = () => {
    const columns = columnEnds.length;
    for (const p of cluster) p.columns = columns;
    placements.push(...cluster);
    cluster = [];
    columnEnds = [];
    clusterEnd = -1;
  };

  for (const { event, span } of items) {
    if (cluster.length > 0 && span.start >= clusterEnd) flush();
    let column = columnEnds.findIndex((end) => end <= span.start);
    if (column === -1) {
      column = columnEnds.length;
      columnEnds.push(span.end);
    } else {
      columnEnds[column] = span.end;
    }
    cluster.push({ event, startMinutes: span.start, endMinutes: span.end, column, columns: 1 });
    clusterEnd = Math.max(clusterEnd, span.end);
  }
  if (cluster.length > 0) flush();
  return placements;
}

export interface AllDayPlacement {
  event: CalendarEvent;
  /** Index of the first visible day column the bar covers. */
  startCol: number;
  /** Number of day columns covered (clipped to the visible days). */
  span: number;
  /** Row within the all-day area. */
  lane: number;
  /** True when the event started before the first visible day. */
  clippedStart: boolean;
  clippedEnd: boolean;
}

/** The civil dates an event touches, for placing it in day columns. */
export function eventDateSpan(event: CalendarEvent): { first: IsoDate; last: IsoDate } {
  if (event.time.kind === "allDay") return { first: event.time.first, last: event.time.last };
  const first = toIsoDate(event.time.start);
  // A timed event ending exactly at midnight belongs to the previous day.
  const endInclusive = new Date(event.time.end.getTime() - 1);
  const last = toIsoDate(endInclusive);
  return { first, last: compareIsoDate(last, first) < 0 ? first : last };
}

/** True for timed events that span more than one civil day; they are drawn as all-day bars. */
export function isMultiDayTimed(event: CalendarEvent): boolean {
  if (event.time.kind !== "timed") return false;
  const { first, last } = eventDateSpan(event);
  return first !== last;
}

export function isBarEvent(event: CalendarEvent): boolean {
  return event.time.kind === "allDay" || isMultiDayTimed(event);
}

/**
 * Packs all-day (and multi-day) events into lanes over `days`, greedily
 * giving longer and earlier events the top rows.
 */
export function layoutAllDayEvents(events: CalendarEvent[], days: IsoDate[]): AllDayPlacement[] {
  const first = days[0];
  const last = days[days.length - 1];
  if (!first || !last) return [];
  const items = events
    .filter(isBarEvent)
    .map((event) => ({ event, ...eventDateSpan(event) }))
    .filter((e) => compareIsoDate(e.first, last) <= 0 && compareIsoDate(e.last, first) >= 0)
    .sort((a, b) => compareIsoDate(a.first, b.first) || daysBetween(b.first, b.last) - daysBetween(a.first, a.last) || a.event.title.localeCompare(b.event.title));

  const laneEnds: number[] = []; // last column index occupied per lane
  const out: AllDayPlacement[] = [];
  for (const item of items) {
    const clippedStart = compareIsoDate(item.first, first) < 0;
    const clippedEnd = compareIsoDate(item.last, last) > 0;
    const startCol = clippedStart ? 0 : daysBetween(first, item.first);
    const endCol = clippedEnd ? days.length - 1 : daysBetween(first, item.last);
    let lane = laneEnds.findIndex((end) => end < startCol);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(endCol);
    } else {
      laneEnds[lane] = endCol;
    }
    out.push({ event: item.event, startCol, span: endCol - startCol + 1, lane, clippedStart, clippedEnd });
  }
  return out;
}

/** Events that touch `day` in any way, sorted all-day first then by start. */
export function eventsOnDay(events: CalendarEvent[], day: IsoDate): CalendarEvent[] {
  return events
    .filter((e) => {
      const { first, last } = eventDateSpan(e);
      return compareIsoDate(first, day) <= 0 && compareIsoDate(last, day) >= 0;
    })
    .sort((a, b) => {
      const aBar = isBarEvent(a) ? 0 : 1;
      const bBar = isBarEvent(b) ? 0 : 1;
      if (aBar !== bBar) return aBar - bBar;
      if (a.time.kind === "timed" && b.time.kind === "timed") return a.time.start.getTime() - b.time.start.getTime();
      return a.title.localeCompare(b.title);
    });
}
