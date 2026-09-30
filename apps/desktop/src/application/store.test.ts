import { describe, expect, it } from "vitest";
import { createAppStore } from "./store";
import { createMockBackend } from "@/infrastructure/mockBackend";

const now = () => new Date(2026, 8, 30, 15, 24); // Wed 30 Sep 2026, local

async function ready() {
  const backend = createMockBackend({ now });
  const store = createAppStore(backend, { now, changeDebounce: 0 });
  await store.getState().init();
  return { backend, store };
}

describe("app store", () => {
  it("loads the workspace, the current week and reminders", async () => {
    const { store } = await ready();
    const s = store.getState();
    expect(s.status).toBe("ready");
    expect(s.view).toBe("week");
    expect(s.anchor).toBe("2026-09-30");
    expect(s.events.length).toBeGreaterThan(10);
    expect(s.reminders.length).toBeGreaterThan(10);
    expect(s.events.some((e) => e.id === "evt-birthday")).toBe(true);
  });

  it("navigates and reloads events for the new window", async () => {
    const { store } = await ready();
    store.getState().step(1);
    expect(store.getState().anchor).toBe("2026-10-07");
    await new Promise((r) => setTimeout(r, 0));
    expect(store.getState().events).toHaveLength(0);
    store.getState().goToToday();
    await new Promise((r) => setTimeout(r, 0));
    expect(store.getState().events.length).toBeGreaterThan(0);
  });

  it("toggles calendars optimistically and re-queries", async () => {
    const { store } = await ready();
    const before = store.getState().events.length;
    await store.getState().toggleCalendar("cal-work");
    const s = store.getState();
    expect(s.workspace?.preferences.hiddenCalendars).toContain("cal-work");
    expect(s.events.length).toBeLessThan(before);
    expect(s.events.every((e) => e.calendarId !== "cal-work")).toBe(true);
  });

  it("completes and reopens reminders optimistically", async () => {
    const { store } = await ready();
    await store.getState().toggleReminder("rem-3");
    expect(store.getState().reminders.find((r) => r.id === "rem-3")?.completedAt).not.toBeNull();
    await store.getState().toggleReminder("rem-3");
    expect(store.getState().reminders.find((r) => r.id === "rem-3")?.completedAt).toBeNull();
  });

  it("moves an event keeping its duration and rolls back on failure", async () => {
    const { store } = await ready();
    const event = store.getState().events.find((e) => e.title === "Team sync")!;
    const newStart = new Date(2026, 9, 1, 13, 0);
    await store.getState().moveEvent(event, newStart, "2026-10-01");
    const moved = store.getState().events.find((e) => e.id === event.id)!;
    expect(moved.time.kind === "timed" && moved.time.start.getTime()).toBe(newStart.getTime());
    expect(moved.time.kind === "timed" && moved.time.end.getHours()).toBe(14);

    const birthday = { ...event, readOnly: true };
    await store.getState().moveEvent(birthday, newStart, "2026-10-01");
    expect(store.getState().notices.at(-1)?.tone).toBe("error");
  });

  it("surfaces backend errors as notices instead of throwing", async () => {
    const { store } = await ready();
    const result = await store.getState().createReminder({ listId: "list-work", title: "   " });
    expect(result).toBeNull();
    expect(store.getState().notices[0]?.message).toMatch(/title/);
  });

  it("refreshes when the backend reports external changes", async () => {
    const { backend, store } = await ready();
    backend.state.reminders = backend.state.reminders.filter((r) => r.id !== "rem-1");
    backend.state.listeners.forEach((l) => l());
    await new Promise((r) => setTimeout(r, 5));
    expect(store.getState().reminders.some((r) => r.id === "rem-1")).toBe(false);
  });

  it("searches across both kinds", async () => {
    const { store } = await ready();
    store.getState().setSearchQuery("client");
    await new Promise((r) => setTimeout(r, 0));
    const results = store.getState().searchResults!;
    expect(results.events.map((e) => e.title)).toContain("Call with client");
    expect(results.reminders.map((r) => r.title)).toContain("Call with client");
    expect(store.getState().searchOpen).toBe(true);
  });
});
