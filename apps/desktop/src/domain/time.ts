/**
 * Civil-date and clock arithmetic. Everything here is pure and zone-aware
 * only where a `Date` is involved (which always means the browser's zone).
 */
import type { IsoDate, ClockTime, TimeRange } from "./model";

export type ViewMode = "day" | "week" | "month";

const DAY_MS = 86_400_000;

export const WEEK_STARTS_ON = 1; // Monday, as in the reference design

export function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

export function toIsoDate(date: Date): IsoDate {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

export function parseIsoDate(value: IsoDate): { year: number; month: number; day: number } {
  const [y, m, d] = value.split("-").map(Number);
  if (!y || !m || !d) throw new Error(`bad ISO date: ${value}`);
  return { year: y, month: m, day: d };
}

/** Local midnight at the start of `date`. */
export function localMidnight(date: IsoDate): Date {
  const { year, month, day } = parseIsoDate(date);
  return new Date(year, month - 1, day, 0, 0, 0, 0);
}

export function todayIso(now: Date = new Date()): IsoDate {
  return toIsoDate(now);
}

export function addDays(date: IsoDate, days: number): IsoDate {
  const { year, month, day } = parseIsoDate(date);
  return toIsoDate(new Date(year, month - 1, day + days));
}

export function addMonths(date: IsoDate, months: number): IsoDate {
  const { year, month, day } = parseIsoDate(date);
  const target = new Date(year, month - 1 + months, 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  return toIsoDate(new Date(target.getFullYear(), target.getMonth(), Math.min(day, lastDay)));
}

export function compareIsoDate(a: IsoDate, b: IsoDate): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function daysBetween(a: IsoDate, b: IsoDate): number {
  return Math.round((localMidnight(b).getTime() - localMidnight(a).getTime()) / DAY_MS);
}

/** 0 = Monday ... 6 = Sunday. */
export function weekdayIndex(date: IsoDate): number {
  const js = localMidnight(date).getDay(); // 0 = Sunday
  return (js - WEEK_STARTS_ON + 7) % 7;
}

export function startOfWeek(date: IsoDate): IsoDate {
  return addDays(date, -weekdayIndex(date));
}

export function startOfMonth(date: IsoDate): IsoDate {
  const { year, month } = parseIsoDate(date);
  return toIsoDate(new Date(year, month - 1, 1));
}

export function daysInMonth(date: IsoDate): number {
  const { year, month } = parseIsoDate(date);
  return new Date(year, month, 0).getDate();
}

export function sameMonth(a: IsoDate, b: IsoDate): boolean {
  return a.slice(0, 7) === b.slice(0, 7);
}

/** Seven consecutive days starting on the week containing `date`. */
export function weekDays(date: IsoDate): IsoDate[] {
  const start = startOfWeek(date);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

/**
 * The 6×7 grid of dates shown for the month containing `date`, starting on
 * the week that contains the 1st. Always six rows so the layout never jumps.
 */
export function monthGrid(date: IsoDate): IsoDate[][] {
  const first = startOfWeek(startOfMonth(date));
  return Array.from({ length: 6 }, (_, row) =>
    Array.from({ length: 7 }, (_, col) => addDays(first, row * 7 + col)),
  );
}

/** Which civil dates a view shows, and the instant window to query for them. */
export function visibleDays(view: ViewMode, anchor: IsoDate): IsoDate[] {
  switch (view) {
    case "day":
      return [anchor];
    case "week":
      return weekDays(anchor);
    case "month":
      return monthGrid(anchor).flat();
  }
}

export function rangeForDays(days: IsoDate[]): TimeRange {
  const first = days[0];
  const last = days[days.length - 1];
  if (!first || !last) throw new Error("no days");
  return { start: localMidnight(first), end: localMidnight(addDays(last, 1)) };
}

export function stepAnchor(view: ViewMode, anchor: IsoDate, direction: 1 | -1): IsoDate {
  switch (view) {
    case "day":
      return addDays(anchor, direction);
    case "week":
      return addDays(anchor, 7 * direction);
    case "month":
      return addMonths(anchor, direction);
  }
}

// ---- clock helpers -------------------------------------------------------------

export function minutesSinceMidnight(date: Date): number {
  return date.getHours() * 60 + date.getMinutes() + date.getSeconds() / 60;
}

export function parseClockTime(value: ClockTime): { hour: number; minute: number } {
  const [h, m] = value.split(":").map(Number);
  return { hour: h ?? 0, minute: m ?? 0 };
}

export function clockMinutes(value: ClockTime): number {
  const { hour, minute } = parseClockTime(value);
  return hour * 60 + minute;
}

export function toClockTime(date: Date): ClockTime {
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

export function atClockTime(date: IsoDate, time: ClockTime): Date {
  const { hour, minute } = parseClockTime(time);
  const d = localMidnight(date);
  d.setHours(hour, minute, 0, 0);
  return d;
}

/** Snaps a minute-of-day value to the nearest `step` minutes. */
export function snapMinutes(minutes: number, step = 15): number {
  return Math.max(0, Math.min(24 * 60, Math.round(minutes / step) * step));
}

// ---- formatting -----------------------------------------------------------------

export function uses24HourClock(locale?: string): boolean {
  const parts = new Intl.DateTimeFormat(locale, { hour: "numeric" }).formatToParts(new Date(2000, 0, 1, 13));
  return !parts.some((p) => p.type === "dayPeriod");
}

const timeFormatter = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });

const PERIOD = /\s?(AM|PM)$/i;

/** "9:00 AM" or "09:00", per the user's locale. */
export function formatTime(date: Date): string {
  return timeFormatter.format(date).replace(/\u202f/g, " ");
}

/** "9:00" — the clock without its day period, for dense places like event blocks. */
export function formatTimeCompact(date: Date): string {
  return formatTime(date).replace(PERIOD, "");
}

/** "10:00–11:30" (compact) or "9:00–10:00 AM" (with the shared period). */
export function formatTimeRange(start: Date, end: Date, compact = true): string {
  if (compact) return `${formatTimeCompact(start)}–${formatTimeCompact(end)}`;
  const s = formatTime(start);
  const e = formatTime(end);
  const sp = s.match(PERIOD)?.[1];
  const ep = e.match(PERIOD)?.[1];
  if (sp && ep && sp === ep) return `${s.replace(PERIOD, "")}–${e}`;
  return `${s}–${e}`;
}

export function formatClock(time: ClockTime): string {
  const { hour, minute } = parseClockTime(time);
  return formatTime(new Date(2000, 0, 1, hour, minute));
}

export function formatHourLabel(hour: number): string {
  if (uses24HourClock()) return `${pad2(hour)}:00`;
  const h = hour % 12 === 0 ? 12 : hour % 12;
  return `${h} ${hour < 12 ? "AM" : "PM"}`;
}

export function formatMonthTitle(date: IsoDate): string {
  return new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" }).format(localMidnight(date));
}

export function formatDayTitle(date: IsoDate): string {
  return new Intl.DateTimeFormat(undefined, { weekday: "short", month: "long", day: "numeric", year: "numeric" }).format(localMidnight(date));
}

export function formatWeekdayShort(date: IsoDate): string {
  return new Intl.DateTimeFormat(undefined, { weekday: "short" }).format(localMidnight(date));
}

export function formatWeekdayLetter(index: number): string {
  const monday = new Date(2024, 0, 1); // a Monday
  const d = new Date(monday);
  d.setDate(monday.getDate() + index);
  return new Intl.DateTimeFormat(undefined, { weekday: "narrow" }).format(d);
}

/** "Fri, Oct 2" / "Today" / "Tomorrow" / "Yesterday". */
export function formatRelativeDay(date: IsoDate, today: IsoDate): string {
  const diff = daysBetween(today, date);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  return new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric" }).format(localMidnight(date));
}

export function formatShortDate(date: IsoDate): string {
  return new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric" }).format(localMidnight(date));
}

export function dayOfMonth(date: IsoDate): number {
  return parseIsoDate(date).day;
}
