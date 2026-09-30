/**
 * In-browser `Backend` with seed data, for developing the UI without the
 * native shell (`pnpm dev` in a browser) and for component tests.
 *
 * The seed mirrors `crates/calenda-provider-mock/src/seed.rs` so screenshots
 * from either path look the same.
 */
import type { Backend, BackendError } from "@/application/backend";
import type {
  Calendar,
  CalendarEvent,
  Due,
  EventDraft,
  IsoDate,
  Preferences,
  Priority,
  Reminder,
  ReminderDraft,
  Source,
  TimeRange,
  Workspace,
} from "@/domain/model";
import { addDays, atClockTime, localMidnight, startOfWeek, todayIso, toIsoDate } from "@/domain/time";
import { eventDateSpan } from "@/domain/eventLayout";

const SOURCES: Source[] = [
  { id: "src-icloud", title: "iCloud", kind: "iCloud" },
  { id: "src-google", title: "Google", kind: "calDav" },
  { id: "src-subscribed", title: "Other", kind: "birthdays" },
];

const CALENDARS: Calendar[] = [
  { id: "cal-personal", sourceId: "src-icloud", title: "Personal", color: "#3478F6", kind: "events", readOnly: false },
  { id: "cal-work", sourceId: "src-google", title: "Work", color: "#A259E6", kind: "events", readOnly: false },
  { id: "cal-family", sourceId: "src-icloud", title: "Family", color: "#34C759", kind: "events", readOnly: false },
  { id: "cal-health", sourceId: "src-icloud", title: "Health", color: "#FF6B9D", kind: "events", readOnly: false },
  { id: "cal-birthdays", sourceId: "src-subscribed", title: "Birthdays", color: "#FF7AB6", kind: "events", readOnly: true },
  { id: "list-personal", sourceId: "src-icloud", title: "Personal", color: "#3478F6", kind: "reminders", readOnly: false },
  { id: "list-work", sourceId: "src-icloud", title: "Work", color: "#A259E6", kind: "reminders", readOnly: false },
  { id: "list-travel", sourceId: "src-icloud", title: "Travel", color: "#30B0C7", kind: "reminders", readOnly: false },
  { id: "list-health", sourceId: "src-icloud", title: "Health", color: "#34C759", kind: "reminders", readOnly: false },
  { id: "list-home", sourceId: "src-icloud", title: "Home", color: "#FF9F0A", kind: "reminders", readOnly: false },
  { id: "list-learning", sourceId: "src-icloud", title: "Learning", color: "#5AC8A8", kind: "reminders", readOnly: false },
];

function seedEvents(anchor: IsoDate): CalendarEvent[] {
  const monday = startOfWeek(anchor);
  const day = (offset: number) => addDays(monday, offset);
  let n = 0;
  const timed = (calendarId: string, title: string, d: number, from: string, to: string, location: string | null = null): CalendarEvent => ({
    id: `evt-${++n}`,
    calendarId,
    title,
    time: { kind: "timed", start: atClockTime(day(d), from), end: atClockTime(day(d), to) },
    location,
    notes: null,
    url: null,
    isRecurring: false,
    readOnly: false,
  });
  const allDay = (id: string, calendarId: string, title: string, from: number, to: number, readOnly = false): CalendarEvent => ({
    id,
    calendarId,
    title,
    time: { kind: "allDay", first: day(from), last: day(to) },
    location: null,
    notes: null,
    url: null,
    isRecurring: readOnly,
    readOnly,
  });
  return [
    timed("cal-personal", "Team sync", 0, "10:00", "11:00", "Zoom"),
    timed("cal-work", "Call with client", 0, "14:00", "15:00", "Google Meet"),
    timed("cal-personal", "Movie", 0, "20:00", "21:30", "Cinema"),
    timed("cal-work", "Design review", 1, "11:00", "12:00", "Office"),
    timed("cal-family", "Gym", 1, "17:30", "18:30"),
    timed("cal-health", "Yoga", 2, "09:00", "10:00"),
    timed("cal-family", "Lunch with Anna", 2, "12:00", "13:00", "Cafe Milan"),
    timed("cal-personal", "Write proposal", 2, "16:00", "17:00"),
    timed("cal-work", "Dinner with Alex", 3, "18:30", "20:00", "Bistro Noel"),
    timed("cal-personal", "Product planning", 4, "10:00", "11:30", "Room B"),
    timed("cal-work", "Interview", 4, "14:00", "15:00", "Zoom"),
    timed("cal-family", "Family time", 6, "15:00", "17:00", "At home"),
    allDay("evt-vacation", "cal-family", "🏝️ Vacation", 0, 1),
    allDay("evt-birthday", "cal-birthdays", "🎂 Mom's birthday", 2, 2, true),
    allDay("evt-berlin", "cal-personal", "📍 Berlin", 5, 6),
  ];
}

function seedReminders(anchor: IsoDate, now: Date): Reminder[] {
  const twoHoursAgo = new Date(now.getTime() - 2 * 3600_000);
  const r = (id: string, listId: string, title: string, due: Due | null, priority: Priority = "none", done = false): Reminder => ({
    id,
    listId,
    title,
    notes: null,
    url: null,
    due,
    priority,
    completedAt: done ? twoHoursAgo : null,
    isRecurring: false,
  });
  const on = (date: IsoDate, time: string | null = null): Due => ({ date, time });
  return [
    r("rem-1", "list-work", "Review design mockups", on(anchor, "09:00"), "high"),
    r("rem-2", "list-work", "Call with client", on(anchor, "14:00")),
    r("rem-3", "list-personal", "Buy birthday gift", on(anchor)),
    r("rem-4", "list-personal", "Plan weekend trip", on(anchor)),
    r("rem-5", "list-work", "Write proposal", on(anchor)),
    r("rem-6", "list-personal", "Return library book", on(addDays(anchor, -1)), "medium"),
    r("rem-7", "list-travel", "Book flight to Berlin", on(addDays(anchor, 2))),
    r("rem-8", "list-work", "Prepare presentation", on(addDays(anchor, 5)), "high"),
    r("rem-9", "list-health", "Renew gym membership", on(addDays(anchor, 6))),
    r("rem-10", "list-personal", "Order new keyboard", on(addDays(anchor, 7))),
    r("rem-11", "list-learning", "Learn Rust", null, "low"),
    r("rem-12", "list-home", "Pay phone bill", on(anchor), "none", true),
    r("rem-13", "list-work", "Send team feedback", on(anchor), "none", true),
    r("rem-14", "list-learning", "Read new article", on(anchor), "none", true),
  ];
}

function error(kind: BackendError["kind"], message: string): BackendError {
  return { kind, message };
}

export interface MockBackendOptions {
  anchor?: IsoDate;
  now?: () => Date;
  /** Simulated latency in ms, to exercise loading states. */
  latency?: number;
  empty?: boolean;
}

export function createMockBackend(options: MockBackendOptions = {}): Backend & { state: MockState } {
  const now = options.now ?? (() => new Date());
  const anchor = options.anchor ?? todayIso(now());
  const state: MockState = {
    calendars: [...CALENDARS],
    events: options.empty ? [] : seedEvents(anchor),
    reminders: options.empty ? [] : seedReminders(anchor, now()),
    preferences: { hiddenCalendars: [], showRemindersInGrid: false },
    listeners: new Set(),
  };
  let ids = 1000;
  const nextId = (prefix: string) => `${prefix}-${++ids}`;
  const delay = <T,>(value: T): Promise<T> =>
    options.latency ? new Promise((resolve) => setTimeout(() => resolve(value), options.latency)) : Promise.resolve(value);
  const notify = () => state.listeners.forEach((l) => l());
  const calendar = (id: string) => {
    const c = state.calendars.find((x) => x.id === id);
    if (!c) throw error("notFound", `calendar not found: ${id}`);
    return c;
  };
  const writable = (id: string) => {
    const c = calendar(id);
    if (c.readOnly) throw error("readOnly", "calendar is read-only");
    return c;
  };
  const validTitle = (title: string) => {
    const t = title.trim();
    if (!t) throw error("invalid", "title must not be empty");
    return t;
  };
  const visible = (kind: Calendar["kind"]) =>
    state.calendars.filter((c) => c.kind === kind && !state.preferences.hiddenCalendars.includes(c.id)).map((c) => c.id);

  const workspace = (): Workspace => ({
    providerName: "Browser mock",
    eventAccess: "full",
    reminderAccess: "full",
    sources: SOURCES,
    calendars: state.calendars,
    preferences: { ...state.preferences, hiddenCalendars: [...state.preferences.hiddenCalendars] },
  });

  return {
    state,
    loadWorkspace: () => delay(workspace()),
    setCalendarVisible: (id, isVisible) => {
      const hidden = new Set(state.preferences.hiddenCalendars);
      if (isVisible) hidden.delete(id);
      else hidden.add(id);
      state.preferences = { ...state.preferences, hiddenCalendars: [...hidden] };
      return delay(workspace().preferences);
    },
    setShowRemindersInGrid: (show) => {
      state.preferences = { ...state.preferences, showRemindersInGrid: show };
      return delay(workspace().preferences);
    },

    listEvents: (range: TimeRange) => {
      const ids = visible("events");
      const first = toIsoDate(range.start);
      const last = toIsoDate(new Date(range.end.getTime() - 1));
      return delay(
        state.events.filter((e) => {
          if (!ids.includes(e.calendarId)) return false;
          if (e.time.kind === "timed") return e.time.start < range.end && e.time.end > range.start;
          const span = eventDateSpan(e);
          return span.first <= last && span.last >= first;
        }),
      );
    },
    createEvent: (draft: EventDraft) => {
      writable(draft.calendarId);
      const event: CalendarEvent = {
        id: nextId("evt"),
        calendarId: draft.calendarId,
        title: validTitle(draft.title),
        time: draft.time,
        location: draft.location?.trim() || null,
        notes: draft.notes?.trim() || null,
        url: draft.url?.trim() || null,
        isRecurring: false,
        readOnly: false,
      };
      state.events = [...state.events, event];
      notify();
      return delay(event);
    },
    updateEvent: (id, draft) => {
      writable(draft.calendarId);
      const existing = state.events.find((e) => e.id === id);
      if (!existing) throw error("notFound", `event not found: ${id}`);
      if (existing.readOnly) throw error("readOnly", "event is read-only");
      const updated: CalendarEvent = {
        ...existing,
        calendarId: draft.calendarId,
        title: validTitle(draft.title),
        time: draft.time,
        location: draft.location?.trim() || null,
        notes: draft.notes?.trim() || null,
        url: draft.url?.trim() || null,
      };
      state.events = state.events.map((e) => (e.id === id ? updated : e));
      notify();
      return delay(updated);
    },
    deleteEvent: (id) => {
      const existing = state.events.find((e) => e.id === id);
      if (!existing) throw error("notFound", `event not found: ${id}`);
      if (existing.readOnly) throw error("readOnly", "event is read-only");
      state.events = state.events.filter((e) => e.id !== id);
      notify();
      return delay(undefined);
    },
    moveEvent(event, newStart, newDay) {
      if (event.readOnly) throw error("readOnly", "event is read-only");
      const time: CalendarEvent["time"] =
        event.time.kind === "timed"
          ? { kind: "timed", start: newStart, end: new Date(newStart.getTime() + (event.time.end.getTime() - event.time.start.getTime())) }
          : {
              kind: "allDay",
              first: newDay,
              last: addDays(newDay, Math.round((localMidnight(event.time.last).getTime() - localMidnight(event.time.first).getTime()) / 86_400_000)),
            };
      return this.updateEvent(event.id, { ...event, time }, "thisOccurrence");
    },

    listReminders: () => {
      const ids = visible("reminders");
      const cutoff = now().getTime() - 24 * 3600_000;
      return delay(state.reminders.filter((r) => ids.includes(r.listId) && (!r.completedAt || r.completedAt.getTime() >= cutoff)));
    },
    createReminder: (draft: ReminderDraft) => {
      const list = writable(draft.listId);
      if (list.kind !== "reminders") throw error("invalid", "reminders must belong to a reminder list");
      const reminder: Reminder = {
        id: nextId("rem"),
        listId: draft.listId,
        title: validTitle(draft.title),
        notes: draft.notes?.trim() || null,
        url: draft.url?.trim() || null,
        due: draft.due ?? null,
        priority: draft.priority ?? "none",
        completedAt: null,
        isRecurring: false,
      };
      state.reminders = [...state.reminders, reminder];
      notify();
      return delay(reminder);
    },
    updateReminder: (id, draft) => {
      writable(draft.listId);
      const existing = state.reminders.find((r) => r.id === id);
      if (!existing) throw error("notFound", `reminder not found: ${id}`);
      const updated: Reminder = {
        ...existing,
        listId: draft.listId,
        title: validTitle(draft.title),
        notes: draft.notes?.trim() || null,
        url: draft.url?.trim() || null,
        due: draft.due ?? null,
        priority: draft.priority ?? "none",
      };
      state.reminders = state.reminders.map((r) => (r.id === id ? updated : r));
      notify();
      return delay(updated);
    },
    setReminderCompleted: (id, completed) => {
      const existing = state.reminders.find((r) => r.id === id);
      if (!existing) throw error("notFound", `reminder not found: ${id}`);
      const updated: Reminder = { ...existing, completedAt: completed ? now() : null };
      state.reminders = state.reminders.map((r) => (r.id === id ? updated : r));
      notify();
      return delay(updated);
    },
    deleteReminder: (id) => {
      if (!state.reminders.some((r) => r.id === id)) throw error("notFound", `reminder not found: ${id}`);
      state.reminders = state.reminders.filter((r) => r.id !== id);
      notify();
      return delay(undefined);
    },

    search: (text) => {
      const needle = text.trim().toLowerCase();
      if (!needle) return delay({ events: [], reminders: [] });
      const has = (s: string | null) => s !== null && s.toLowerCase().includes(needle);
      const eventIds = visible("events");
      const listIds = visible("reminders");
      return delay({
        events: state.events.filter((e) => eventIds.includes(e.calendarId) && (has(e.title) || has(e.location) || has(e.notes))),
        reminders: state.reminders.filter((r) => listIds.includes(r.listId) && (has(r.title) || has(r.notes))),
      });
    },

    onStoreChanged: (listener) => {
      state.listeners.add(listener);
      return () => state.listeners.delete(listener);
    },
  };
}

export interface MockState {
  calendars: Calendar[];
  events: CalendarEvent[];
  reminders: Reminder[];
  preferences: Preferences;
  listeners: Set<() => void>;
}
