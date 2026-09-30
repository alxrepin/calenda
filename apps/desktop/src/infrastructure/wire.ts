/**
 * JSON shapes exchanged with the Rust shell, and their mapping to the model.
 * Keep in sync with `apps/desktop/src-tauri/src/dto.rs`.
 */
import type {
  AccessStatus,
  Calendar,
  CalendarEvent,
  CalendarKind,
  Due,
  EventDraft,
  EventTime,
  Preferences,
  Priority,
  Reminder,
  ReminderDraft,
  SearchResults,
  Source,
  SourceKind,
  Workspace,
} from "@/domain/model";

export interface SourceDto {
  id: string;
  title: string;
  kind: SourceKind;
}

export interface CalendarDto {
  id: string;
  sourceId: string;
  title: string;
  color: string;
  kind: CalendarKind;
  readOnly: boolean;
}

export interface PreferencesDto {
  hiddenCalendars: string[];
  showRemindersInGrid: boolean;
}

export interface WorkspaceDto {
  providerName: string;
  eventAccess: AccessStatus;
  reminderAccess: AccessStatus;
  sources: SourceDto[];
  calendars: CalendarDto[];
  preferences: PreferencesDto;
}

export type EventTimeDto =
  | { kind: "timed"; start: string; end: string }
  | { kind: "allDay"; first: string; last: string };

export interface EventDto {
  id: string;
  calendarId: string;
  title: string;
  time: EventTimeDto;
  location: string | null;
  notes: string | null;
  url: string | null;
  isRecurring: boolean;
  readOnly: boolean;
}

export interface EventDraftDto {
  calendarId: string;
  title: string;
  time: EventTimeDto;
  location?: string | null;
  notes?: string | null;
  url?: string | null;
}

export interface DueDto {
  date: string;
  time?: string | null;
}

export interface ReminderDto {
  id: string;
  listId: string;
  title: string;
  notes: string | null;
  url: string | null;
  due: DueDto | null;
  priority: Priority;
  completedAt: string | null;
  isRecurring: boolean;
}

export interface ReminderDraftDto {
  listId: string;
  title: string;
  notes?: string | null;
  url?: string | null;
  due?: DueDto | null;
  priority?: Priority;
}

export interface SearchResultsDto {
  events: EventDto[];
  reminders: ReminderDto[];
}

// ---- from wire -------------------------------------------------------------------

export function workspaceFromDto(dto: WorkspaceDto): Workspace {
  return {
    providerName: dto.providerName,
    eventAccess: dto.eventAccess,
    reminderAccess: dto.reminderAccess,
    sources: dto.sources.map(sourceFromDto),
    calendars: dto.calendars.map(calendarFromDto),
    preferences: preferencesFromDto(dto.preferences),
  };
}

export function sourceFromDto(dto: SourceDto): Source {
  return { id: dto.id, title: dto.title, kind: dto.kind };
}

export function calendarFromDto(dto: CalendarDto): Calendar {
  return { id: dto.id, sourceId: dto.sourceId, title: dto.title, color: dto.color, kind: dto.kind, readOnly: dto.readOnly };
}

export function preferencesFromDto(dto: PreferencesDto): Preferences {
  return { hiddenCalendars: [...dto.hiddenCalendars], showRemindersInGrid: dto.showRemindersInGrid };
}

export function eventTimeFromDto(dto: EventTimeDto): EventTime {
  return dto.kind === "timed"
    ? { kind: "timed", start: new Date(dto.start), end: new Date(dto.end) }
    : { kind: "allDay", first: dto.first, last: dto.last };
}

export function eventFromDto(dto: EventDto): CalendarEvent {
  return {
    id: dto.id,
    calendarId: dto.calendarId,
    title: dto.title,
    time: eventTimeFromDto(dto.time),
    location: dto.location,
    notes: dto.notes,
    url: dto.url,
    isRecurring: dto.isRecurring,
    readOnly: dto.readOnly,
  };
}

export function dueFromDto(dto: DueDto | null): Due | null {
  return dto ? { date: dto.date, time: dto.time ?? null } : null;
}

export function reminderFromDto(dto: ReminderDto): Reminder {
  return {
    id: dto.id,
    listId: dto.listId,
    title: dto.title,
    notes: dto.notes,
    url: dto.url,
    due: dueFromDto(dto.due),
    priority: dto.priority,
    completedAt: dto.completedAt ? new Date(dto.completedAt) : null,
    isRecurring: dto.isRecurring,
  };
}

export function searchResultsFromDto(dto: SearchResultsDto): SearchResults {
  return { events: dto.events.map(eventFromDto), reminders: dto.reminders.map(reminderFromDto) };
}

// ---- to wire -----------------------------------------------------------------------

export function eventTimeToDto(time: EventTime): EventTimeDto {
  return time.kind === "timed"
    ? { kind: "timed", start: time.start.toISOString(), end: time.end.toISOString() }
    : { kind: "allDay", first: time.first, last: time.last };
}

export function eventToDto(event: CalendarEvent): EventDto {
  return { ...event, time: eventTimeToDto(event.time) };
}

export function eventDraftToDto(draft: EventDraft): EventDraftDto {
  return {
    calendarId: draft.calendarId,
    title: draft.title,
    time: eventTimeToDto(draft.time),
    location: draft.location ?? null,
    notes: draft.notes ?? null,
    url: draft.url ?? null,
  };
}

export function reminderDraftToDto(draft: ReminderDraft): ReminderDraftDto {
  return {
    listId: draft.listId,
    title: draft.title,
    notes: draft.notes ?? null,
    url: draft.url ?? null,
    due: draft.due ? { date: draft.due.date, time: draft.due.time } : null,
    priority: draft.priority ?? "none",
  };
}
