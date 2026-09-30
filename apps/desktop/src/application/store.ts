/**
 * Application state and use cases for the UI, as a framework-agnostic
 * zustand store. Components subscribe through `useApp` (see `context.tsx`).
 */
import { createStore, type StoreApi } from "zustand/vanilla";
import type { Backend } from "./backend";
import { describeError } from "./backend";
import type {
  CalendarEvent,
  EventDraft,
  IsoDate,
  Preferences,
  RecurrenceScope,
  Reminder,
  ReminderDraft,
  SearchResults,
  TimeRange,
  Workspace,
} from "@/domain/model";
import type { SidebarFilter } from "@/domain/filters";
import { rangeForDays, stepAnchor, todayIso, visibleDays, type ViewMode } from "@/domain/time";

export type Selection = { kind: "event"; id: string } | { kind: "reminder"; id: string };

export type EditorState =
  | { kind: "event"; mode: "create"; draft: EventDraft; anchorRect?: DOMRect }
  | { kind: "event"; mode: "edit"; event: CalendarEvent; draft: EventDraft; anchorRect?: DOMRect }
  | { kind: "reminder"; mode: "create"; draft: ReminderDraft }
  | { kind: "reminder"; mode: "edit"; reminder: Reminder; draft: ReminderDraft };

export interface Notice {
  id: number;
  message: string;
  tone: "error" | "info";
}

export interface AppState {
  status: "loading" | "ready" | "error";
  error: string | null;
  workspace: Workspace | null;

  today: IsoDate;
  view: ViewMode;
  anchor: IsoDate;

  events: CalendarEvent[];
  eventsRange: TimeRange | null;
  eventsLoading: boolean;
  reminders: Reminder[];

  filter: SidebarFilter;
  selection: Selection | null;
  editor: EditorState | null;
  rightTab: "tasks" | "details";

  searchQuery: string;
  searchResults: SearchResults | null;
  searchOpen: boolean;

  notices: Notice[];
}

export interface AppActions {
  init(): Promise<void>;
  refresh(): Promise<void>;

  setView(view: ViewMode): void;
  goToToday(): void;
  step(direction: 1 | -1): void;
  selectDate(date: IsoDate): void;

  toggleCalendar(id: string): Promise<void>;
  setShowRemindersInGrid(show: boolean): Promise<void>;
  setFilter(filter: SidebarFilter): void;

  createEvent(draft: EventDraft): Promise<CalendarEvent | null>;
  updateEvent(id: string, draft: EventDraft, scope?: RecurrenceScope): Promise<CalendarEvent | null>;
  deleteEvent(id: string, scope?: RecurrenceScope): Promise<boolean>;
  moveEvent(event: CalendarEvent, newStart: Date, newDay: IsoDate): Promise<void>;

  createReminder(draft: ReminderDraft): Promise<Reminder | null>;
  updateReminder(id: string, draft: ReminderDraft): Promise<Reminder | null>;
  toggleReminder(id: string): Promise<void>;
  deleteReminder(id: string): Promise<boolean>;

  select(selection: Selection | null): void;
  openEditor(editor: EditorState): void;
  closeEditor(): void;
  setRightTab(tab: "tasks" | "details"): void;

  setSearchQuery(query: string): void;
  setSearchOpen(open: boolean): void;

  dismissNotice(id: number): void;
}

export type AppStore = StoreApi<AppState & AppActions>;

export interface StoreOptions {
  now?: () => Date;
  /** Debounce for external change notifications, ms. */
  changeDebounce?: number;
}

export function createAppStore(backend: Backend, options: StoreOptions = {}): AppStore {
  const now = options.now ?? (() => new Date());
  let noticeSeq = 0;
  let searchSeq = 0;
  let eventsSeq = 0;
  let changeTimer: ReturnType<typeof setTimeout> | null = null;

  return createStore<AppState & AppActions>((set, get) => {
    const fail = (error: unknown) => {
      const message = describeError(error);
      set((s) => ({ notices: [...s.notices, { id: ++noticeSeq, message, tone: "error" }] }));
    };

    const applyPreferences = (preferences: Preferences) =>
      set((s) => (s.workspace ? { workspace: { ...s.workspace, preferences } } : {}));

    const loadEvents = async () => {
      const { view, anchor } = get();
      const range = rangeForDays(visibleDays(view, anchor));
      const seq = ++eventsSeq;
      set({ eventsLoading: true });
      try {
        const events = await backend.listEvents(range);
        if (seq === eventsSeq) set({ events, eventsRange: range, eventsLoading: false });
      } catch (error) {
        if (seq === eventsSeq) set({ eventsLoading: false });
        fail(error);
      }
    };

    const loadReminders = async () => {
      try {
        set({ reminders: await backend.listReminders() });
      } catch (error) {
        fail(error);
      }
    };

    const reloadAll = () => Promise.all([loadEvents(), loadReminders()]).then(() => undefined);

    const runSearch = async (query: string) => {
      const seq = ++searchSeq;
      if (!query.trim()) {
        set({ searchResults: null });
        return;
      }
      try {
        const results = await backend.search(query);
        if (seq === searchSeq) set({ searchResults: results });
      } catch (error) {
        fail(error);
      }
    };

    return {
      status: "loading",
      error: null,
      workspace: null,
      today: todayIso(now()),
      view: "week",
      anchor: todayIso(now()),
      events: [],
      eventsRange: null,
      eventsLoading: false,
      reminders: [],
      filter: "all",
      selection: null,
      editor: null,
      rightTab: "tasks",
      searchQuery: "",
      searchResults: null,
      searchOpen: false,
      notices: [],

      async init() {
        set({ status: "loading", error: null, today: todayIso(now()) });
        try {
          const workspace = await backend.loadWorkspace();
          set({ workspace, status: "ready" });
        } catch (error) {
          set({ status: "error", error: describeError(error) });
          return;
        }
        await reloadAll();
        backend.onStoreChanged(() => {
          if (changeTimer) clearTimeout(changeTimer);
          changeTimer = setTimeout(() => void get().refresh(), options.changeDebounce ?? 250);
        });
      },

      async refresh() {
        set({ today: todayIso(now()) });
        try {
          set({ workspace: await backend.loadWorkspace() });
        } catch (error) {
          fail(error);
        }
        await reloadAll();
        const { searchQuery } = get();
        if (searchQuery) await runSearch(searchQuery);
      },

      setView(view) {
        if (view === get().view) return;
        set({ view });
        void loadEvents();
      },
      goToToday() {
        set({ anchor: todayIso(now()), today: todayIso(now()) });
        void loadEvents();
      },
      step(direction) {
        set((s) => ({ anchor: stepAnchor(s.view, s.anchor, direction) }));
        void loadEvents();
      },
      selectDate(date) {
        set({ anchor: date });
        void loadEvents();
      },

      async toggleCalendar(id) {
        const ws = get().workspace;
        if (!ws) return;
        const hidden = new Set(ws.preferences.hiddenCalendars);
        const visible = hidden.has(id);
        if (visible) hidden.delete(id);
        else hidden.add(id);
        applyPreferences({ ...ws.preferences, hiddenCalendars: [...hidden] });
        try {
          applyPreferences(await backend.setCalendarVisible(id, visible));
        } catch (error) {
          fail(error);
        }
        await reloadAll();
      },
      async setShowRemindersInGrid(show) {
        const ws = get().workspace;
        if (!ws) return;
        applyPreferences({ ...ws.preferences, showRemindersInGrid: show });
        try {
          applyPreferences(await backend.setShowRemindersInGrid(show));
        } catch (error) {
          fail(error);
        }
      },
      setFilter(filter) {
        set({ filter });
      },

      async createEvent(draft) {
        try {
          const event = await backend.createEvent(draft);
          set({ editor: null, selection: { kind: "event", id: event.id } });
          await loadEvents();
          return event;
        } catch (error) {
          fail(error);
          return null;
        }
      },
      async updateEvent(id, draft, scope = "thisOccurrence") {
        try {
          const event = await backend.updateEvent(id, draft, scope);
          set((s) => ({ editor: null, events: s.events.map((e) => (e.id === id ? event : e)) }));
          await loadEvents();
          return event;
        } catch (error) {
          fail(error);
          return null;
        }
      },
      async deleteEvent(id, scope = "thisOccurrence") {
        try {
          await backend.deleteEvent(id, scope);
          set((s) => ({
            editor: null,
            events: s.events.filter((e) => e.id !== id),
            selection: s.selection?.kind === "event" && s.selection.id === id ? null : s.selection,
          }));
          return true;
        } catch (error) {
          fail(error);
          return false;
        }
      },
      async moveEvent(event, newStart, newDay) {
        const previous = get().events;
        // Optimistic: show the event in its new slot immediately.
        const optimistic: CalendarEvent =
          event.time.kind === "timed"
            ? { ...event, time: { kind: "timed", start: newStart, end: new Date(newStart.getTime() + (event.time.end.getTime() - event.time.start.getTime())) } }
            : event;
        set({ events: previous.map((e) => (e.id === event.id ? optimistic : e)) });
        try {
          const moved = await backend.moveEvent(event, newStart, newDay);
          set((s) => ({ events: s.events.map((e) => (e.id === event.id ? moved : e)) }));
        } catch (error) {
          set({ events: previous });
          fail(error);
        }
      },

      async createReminder(draft) {
        try {
          const reminder = await backend.createReminder(draft);
          set((s) => ({ editor: null, reminders: [...s.reminders, reminder] }));
          return reminder;
        } catch (error) {
          fail(error);
          return null;
        }
      },
      async updateReminder(id, draft) {
        try {
          const reminder = await backend.updateReminder(id, draft);
          set((s) => ({ editor: null, reminders: s.reminders.map((r) => (r.id === id ? reminder : r)) }));
          return reminder;
        } catch (error) {
          fail(error);
          return null;
        }
      },
      async toggleReminder(id) {
        const current = get().reminders.find((r) => r.id === id);
        if (!current) return;
        const completed = current.completedAt === null;
        set((s) => ({
          reminders: s.reminders.map((r) => (r.id === id ? { ...r, completedAt: completed ? now() : null } : r)),
        }));
        try {
          const updated = await backend.setReminderCompleted(id, completed);
          set((s) => ({ reminders: s.reminders.map((r) => (r.id === id ? updated : r)) }));
        } catch (error) {
          set((s) => ({ reminders: s.reminders.map((r) => (r.id === id ? current : r)) }));
          fail(error);
        }
      },
      async deleteReminder(id) {
        try {
          await backend.deleteReminder(id);
          set((s) => ({
            editor: null,
            reminders: s.reminders.filter((r) => r.id !== id),
            selection: s.selection?.kind === "reminder" && s.selection.id === id ? null : s.selection,
          }));
          return true;
        } catch (error) {
          fail(error);
          return false;
        }
      },

      select(selection) {
        set({ selection, rightTab: selection ? "details" : get().rightTab });
      },
      openEditor(editor) {
        set({ editor });
      },
      closeEditor() {
        set({ editor: null });
      },
      setRightTab(tab) {
        set({ rightTab: tab });
      },

      setSearchQuery(query) {
        set({ searchQuery: query, searchOpen: query.trim().length > 0 });
        void runSearch(query);
      },
      setSearchOpen(open) {
        set({ searchOpen: open });
      },

      dismissNotice(id) {
        set((s) => ({ notices: s.notices.filter((n) => n.id !== id) }));
      },
    };
  });
}
