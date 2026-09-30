/**
 * The port the UI talks through. Implemented by the Tauri adapter in the
 * app and by an in-browser mock for `pnpm dev` without a native shell.
 */
import type {
  CalendarEvent,
  EventDraft,
  Preferences,
  RecurrenceScope,
  Reminder,
  ReminderDraft,
  SearchResults,
  TimeRange,
  Workspace,
  IsoDate,
} from "@/domain/model";

export interface BackendError {
  kind: "accessDenied" | "notFound" | "readOnly" | "invalid" | "provider" | "shell";
  message: string;
}

export function isBackendError(value: unknown): value is BackendError {
  return typeof value === "object" && value !== null && "kind" in value && "message" in value;
}

export function describeError(error: unknown): string {
  if (isBackendError(error)) return error.message;
  if (error instanceof Error) return error.message;
  return String(error);
}

export interface Backend {
  loadWorkspace(): Promise<Workspace>;
  setCalendarVisible(calendarId: string, visible: boolean): Promise<Preferences>;
  setShowRemindersInGrid(show: boolean): Promise<Preferences>;

  listEvents(range: TimeRange): Promise<CalendarEvent[]>;
  createEvent(draft: EventDraft): Promise<CalendarEvent>;
  updateEvent(id: string, draft: EventDraft, scope: RecurrenceScope): Promise<CalendarEvent>;
  deleteEvent(id: string, scope: RecurrenceScope): Promise<void>;
  moveEvent(event: CalendarEvent, newStart: Date, newDay: IsoDate): Promise<CalendarEvent>;

  listReminders(): Promise<Reminder[]>;
  createReminder(draft: ReminderDraft): Promise<Reminder>;
  updateReminder(id: string, draft: ReminderDraft): Promise<Reminder>;
  setReminderCompleted(id: string, completed: boolean): Promise<Reminder>;
  deleteReminder(id: string): Promise<void>;

  search(text: string): Promise<SearchResults>;

  /** Fires when the underlying store changed for any reason. Returns an unsubscribe function. */
  onStoreChanged(listener: () => void): () => void;
}
