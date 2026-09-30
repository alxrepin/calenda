import { useEffect, useMemo } from "react";
import { useApp } from "@/application/context";
import type { AccessStatus } from "@/domain/model";
import { visibleDays } from "@/domain/time";
import { openExternal } from "@/infrastructure/openExternal";
import { MonthView } from "../calendar/MonthView";
import { TimeGrid } from "../calendar/TimeGrid";
import { Notices } from "../common/Notices";
import { EditorHost } from "../editors/EditorHost";
import { Sidebar } from "../sidebar/Sidebar";
import { TasksPanel } from "../tasks/TasksPanel";
import { Toolbar } from "../toolbar/Toolbar";
import styles from "./AppShell.module.css";

import { accessLabel, SETTINGS_CALENDARS_URL } from "../sidebar/SettingsPopover";

export function AppShell() {
  const status = useApp((s) => s.status);
  const error = useApp((s) => s.error);
  const view = useApp((s) => s.view);
  const anchor = useApp((s) => s.anchor);
  const workspace = useApp((s) => s.workspace);
  const days = useMemo(() => visibleDays(view, anchor), [view, anchor]);

  useKeyboardShortcuts();

  if (status === "loading") {
    return (
      <div className={styles.shell}>
        <div className={styles.center}>Loading your calendars…</div>
      </div>
    );
  }
  if (status === "error") {
    return (
      <div className={styles.shell}>
        <div className={styles.center}>Could not start: {error}</div>
      </div>
    );
  }

  const noEventAccess = workspace !== null && workspace.eventAccess !== "full";

  return (
    <div className={styles.shell}>
      <Sidebar />
      <main className={styles.main}>
        <Toolbar />
        {noEventAccess ? <AccessGate status={workspace.eventAccess} /> : view === "month" ? <MonthView /> : <TimeGrid days={days} />}
      </main>
      <TasksPanel />
      <EditorHost />
      <Notices />
    </div>
  );
}

function AccessGate({ status }: { status: AccessStatus }) {
  const refresh = useApp((s) => s.refresh);
  return (
    <div className={styles.center}>
      <div className={styles.access}>
        <div className={styles.accessTitle}>Calenda needs full access to your Calendars</div>
        <p>Current state: {accessLabel(status)}. Grant full access in System Settings → Privacy &amp; Security → Calendars.</p>
        <div style={{ display: "flex", gap: 8 }}>
          {status === "notDetermined" ? (
            <button type="button" className={styles.accessBtn} onClick={() => void refresh()}>
              Ask for access
            </button>
          ) : (
            <button type="button" className={styles.accessBtn} onClick={() => void openExternal(SETTINGS_CALENDARS_URL)}>
              Open System Settings
            </button>
          )}
        </div>
        <button type="button" onClick={() => void refresh()} style={{ color: "var(--accent)" }}>
          Check again
        </button>
      </div>
    </div>
  );
}

function useKeyboardShortcuts() {
  const step = useApp((s) => s.step);
  const goToToday = useApp((s) => s.goToToday);
  const setView = useApp((s) => s.setView);
  const editor = useApp((s) => s.editor);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (editor) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      switch (e.key) {
        case "ArrowLeft":
          step(-1);
          break;
        case "ArrowRight":
          step(1);
          break;
        case "t":
        case "T":
          goToToday();
          break;
        case "d":
        case "D":
          setView("day");
          break;
        case "w":
        case "W":
          setView("week");
          break;
        case "m":
        case "M":
          setView("month");
          break;
        default:
          return;
      }
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [step, goToToday, setView, editor]);
}
