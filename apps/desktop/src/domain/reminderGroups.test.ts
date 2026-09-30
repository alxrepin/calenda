import { describe, expect, it } from "vitest";
import type { Reminder } from "./model";
import { compareReminders, groupReminders } from "./reminderGroups";

function reminder(partial: Partial<Reminder> & { id: string }): Reminder {
  return {
    listId: "l",
    title: partial.id,
    notes: null,
    url: null,
    due: null,
    priority: "none",
    completedAt: null,
    isRecurring: false,
    ...partial,
  };
}

const today = "2026-09-30";

describe("grouping", () => {
  it("buckets by due date relative to today", () => {
    const groups = groupReminders(
      [
        reminder({ id: "late", due: { date: "2026-09-29", time: null } }),
        reminder({ id: "now", due: { date: today, time: "14:00" } }),
        reminder({ id: "soon", due: { date: "2026-10-02", time: null } }),
        reminder({ id: "someday" }),
        reminder({ id: "done", due: { date: today, time: null }, completedAt: new Date() }),
      ],
      today,
    );
    expect(groups.map((g) => g.key)).toEqual(["overdue", "today", "upcoming", "noDate", "completed"]);
    expect(groups.map((g) => g.reminders.map((r) => r.id))).toEqual([["late"], ["now"], ["soon"], ["someday"], ["done"]]);
  });

  it("always shows Today, even when empty", () => {
    expect(groupReminders([], today).map((g) => g.key)).toEqual(["today"]);
  });

  it("sorts timed before untimed, then by priority, then title", () => {
    const list = [
      reminder({ id: "b", due: { date: today, time: null }, priority: "none" }),
      reminder({ id: "a", due: { date: today, time: null }, priority: "none" }),
      reminder({ id: "hi", due: { date: today, time: null }, priority: "high" }),
      reminder({ id: "t2", due: { date: today, time: "14:00" } }),
      reminder({ id: "t1", due: { date: today, time: "09:00" } }),
    ].sort(compareReminders);
    expect(list.map((r) => r.id)).toEqual(["t1", "t2", "hi", "a", "b"]);
  });
});
