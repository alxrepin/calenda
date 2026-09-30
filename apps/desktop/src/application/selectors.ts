import type { AppState } from "./store";
import type { Calendar, CalendarEvent, Reminder } from "@/domain/model";
import { eventsVisibleUnder, filterReminders } from "@/domain/filters";

export function selectCalendars(state: AppState): Calendar[] {
  return state.workspace?.calendars ?? [];
}

export function selectCalendarMap(calendars: Calendar[]): Map<string, Calendar> {
  return new Map(calendars.map((c) => [c.id, c]));
}

export function selectVisibleEvents(state: AppState): CalendarEvent[] {
  return eventsVisibleUnder(state.filter) ? state.events : [];
}

export function selectVisibleReminders(state: AppState): Reminder[] {
  return filterReminders(state.reminders, state.filter);
}

export function selectSelectedEvent(state: AppState): CalendarEvent | null {
  if (state.selection?.kind !== "event") return null;
  const id = state.selection.id;
  return state.events.find((e) => e.id === id) ?? state.searchResults?.events.find((e) => e.id === id) ?? null;
}

export function selectSelectedReminder(state: AppState): Reminder | null {
  if (state.selection?.kind !== "reminder") return null;
  const id = state.selection.id;
  return state.reminders.find((r) => r.id === id) ?? state.searchResults?.reminders.find((r) => r.id === id) ?? null;
}

export function selectDefaultEventCalendar(state: AppState): Calendar | null {
  const hidden = new Set(state.workspace?.preferences.hiddenCalendars ?? []);
  const calendars = selectCalendars(state).filter((c) => c.kind === "events" && !c.readOnly);
  return calendars.find((c) => !hidden.has(c.id)) ?? calendars[0] ?? null;
}

export function selectDefaultReminderList(state: AppState): Calendar | null {
  const hidden = new Set(state.workspace?.preferences.hiddenCalendars ?? []);
  const lists = selectCalendars(state).filter((c) => c.kind === "reminders" && !c.readOnly);
  return lists.find((c) => !hidden.has(c.id)) ?? lists[0] ?? null;
}
