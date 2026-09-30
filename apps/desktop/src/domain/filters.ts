/**
 * The sidebar "Filters" section: quick views over both entity kinds.
 */
import { isCompleted, type CalendarEvent, type Reminder } from "./model";

export type SidebarFilter = "all" | "events" | "reminders" | "highPriority" | "myTasks";

export interface FilterCounts {
  all: number;
  events: number;
  reminders: number;
  highPriority: number;
  myTasks: number;
}

/** Counts for the badges, computed over the visible period's events and open reminders. */
export function filterCounts(events: CalendarEvent[], reminders: Reminder[]): FilterCounts {
  const open = reminders.filter((r) => !isCompleted(r));
  const highPriority = open.filter((r) => r.priority === "high").length;
  return {
    all: events.length + open.length,
    events: events.length,
    reminders: open.length,
    highPriority,
    myTasks: open.length,
  };
}

export function eventsVisibleUnder(filter: SidebarFilter): boolean {
  return filter === "all" || filter === "events";
}

export function filterReminders(reminders: Reminder[], filter: SidebarFilter): Reminder[] {
  switch (filter) {
    case "events":
      return [];
    case "highPriority":
      return reminders.filter((r) => r.priority === "high");
    default:
      return reminders;
  }
}
