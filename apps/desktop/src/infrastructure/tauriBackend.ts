/**
 * `Backend` over Tauri commands. Command names and payload keys mirror
 * `apps/desktop/src-tauri/src/commands.rs`.
 */
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { Backend } from "@/application/backend";
import type { CalendarEvent, EventDraft, IsoDate, RecurrenceScope, ReminderDraft, TimeRange } from "@/domain/model";
import {
  eventDraftToDto,
  eventFromDto,
  eventToDto,
  preferencesFromDto,
  reminderDraftToDto,
  reminderFromDto,
  searchResultsFromDto,
  workspaceFromDto,
  type EventDto,
  type PreferencesDto,
  type ReminderDto,
  type SearchResultsDto,
  type WorkspaceDto,
} from "./wire";

const STORE_CHANGED_EVENT = "calenda://store-changed";

export function createTauriBackend(): Backend {
  return {
    async loadWorkspace() {
      return workspaceFromDto(await invoke<WorkspaceDto>("load_workspace"));
    },
    async setCalendarVisible(calendarId, visible) {
      return preferencesFromDto(await invoke<PreferencesDto>("set_calendar_visible", { calendarId, visible }));
    },
    async setShowRemindersInGrid(show) {
      return preferencesFromDto(await invoke<PreferencesDto>("set_show_reminders_in_grid", { show }));
    },

    async listEvents(range: TimeRange) {
      const dtos = await invoke<EventDto[]>("list_events", { start: range.start.toISOString(), end: range.end.toISOString() });
      return dtos.map(eventFromDto);
    },
    async createEvent(draft: EventDraft) {
      return eventFromDto(await invoke<EventDto>("create_event", { draft: eventDraftToDto(draft) }));
    },
    async updateEvent(id: string, draft: EventDraft, scope: RecurrenceScope) {
      return eventFromDto(await invoke<EventDto>("update_event", { id, draft: eventDraftToDto(draft), scope }));
    },
    async deleteEvent(id: string, scope: RecurrenceScope) {
      await invoke("delete_event", { id, scope });
    },
    async moveEvent(event: CalendarEvent, newStart: Date, newDay: IsoDate) {
      return eventFromDto(
        await invoke<EventDto>("move_event", { event: eventToDto(event), newStart: newStart.toISOString(), newDay }),
      );
    },

    async listReminders() {
      return (await invoke<ReminderDto[]>("list_reminders", { completedWindowHours: 24 })).map(reminderFromDto);
    },
    async createReminder(draft: ReminderDraft) {
      return reminderFromDto(await invoke<ReminderDto>("create_reminder", { draft: reminderDraftToDto(draft) }));
    },
    async updateReminder(id: string, draft: ReminderDraft) {
      return reminderFromDto(await invoke<ReminderDto>("update_reminder", { id, draft: reminderDraftToDto(draft) }));
    },
    async setReminderCompleted(id: string, completed: boolean) {
      return reminderFromDto(await invoke<ReminderDto>("set_reminder_completed", { id, completed }));
    },
    async deleteReminder(id: string) {
      await invoke("delete_reminder", { id });
    },

    async search(text: string) {
      return searchResultsFromDto(await invoke<SearchResultsDto>("search", { text }));
    },

    onStoreChanged(listener) {
      let active = true;
      const unlisten = listen(STORE_CHANGED_EVENT, () => {
        if (active) listener();
      });
      return () => {
        active = false;
        void unlisten.then((f) => f());
      };
    },
  };
}
