/**
 * Frontend domain model.
 *
 * Mirrors the Rust domain but with browser-friendly types: timed things are
 * `Date` instances, civil dates are `"YYYY-MM-DD"` strings and clock times
 * are `"HH:MM"` strings. Civil dates stay strings on purpose: a JS `Date` at
 * local midnight silently shifts across zones, a string does not.
 */

export type IsoDate = string; // "2026-09-30"
export type ClockTime = string; // "14:30"

export type AccessStatus = "notDetermined" | "denied" | "writeOnly" | "full";

export type SourceKind = "local" | "iCloud" | "exchange" | "calDav" | "subscribed" | "birthdays" | "other";

export interface Source {
  id: string;
  title: string;
  kind: SourceKind;
}

export type CalendarKind = "events" | "reminders";

export interface Calendar {
  id: string;
  sourceId: string;
  title: string;
  /** `#RRGGBB` */
  color: string;
  kind: CalendarKind;
  readOnly: boolean;
}

export interface Preferences {
  hiddenCalendars: string[];
  showRemindersInGrid: boolean;
}

export interface Workspace {
  providerName: string;
  eventAccess: AccessStatus;
  reminderAccess: AccessStatus;
  sources: Source[];
  calendars: Calendar[];
  preferences: Preferences;
}

export type EventTime =
  | { kind: "timed"; start: Date; end: Date }
  | { kind: "allDay"; first: IsoDate; last: IsoDate };

export interface CalendarEvent {
  id: string;
  calendarId: string;
  title: string;
  time: EventTime;
  location: string | null;
  notes: string | null;
  url: string | null;
  isRecurring: boolean;
  readOnly: boolean;
}

export interface EventDraft {
  calendarId: string;
  title: string;
  time: EventTime;
  location?: string | null;
  notes?: string | null;
  url?: string | null;
}

export type RecurrenceScope = "thisOccurrence" | "thisAndFuture";

export interface Due {
  date: IsoDate;
  time: ClockTime | null;
}

export type Priority = "none" | "low" | "medium" | "high";

export interface Reminder {
  id: string;
  listId: string;
  title: string;
  notes: string | null;
  url: string | null;
  due: Due | null;
  priority: Priority;
  completedAt: Date | null;
  isRecurring: boolean;
}

export interface ReminderDraft {
  listId: string;
  title: string;
  notes?: string | null;
  url?: string | null;
  due?: Due | null;
  priority?: Priority;
}

export interface SearchResults {
  events: CalendarEvent[];
  reminders: Reminder[];
}

export interface TimeRange {
  start: Date;
  end: Date;
}

export function isCompleted(reminder: Reminder): boolean {
  return reminder.completedAt !== null;
}

export function calendarById(calendars: Calendar[], id: string): Calendar | undefined {
  return calendars.find((c) => c.id === id);
}
