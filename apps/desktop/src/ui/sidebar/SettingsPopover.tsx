import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useApp } from "@/application/context";
import type { AccessStatus } from "@/domain/model";
import { openExternal } from "@/infrastructure/openExternal";
import { Checkbox } from "../common/Checkbox";
import styles from "./SettingsPopover.module.css";

export const SETTINGS_CALENDARS_URL = "x-apple.systempreferences:com.apple.preference.security?Privacy_Calendars";
export const SETTINGS_REMINDERS_URL = "x-apple.systempreferences:com.apple.preference.security?Privacy_Reminders";

export function accessLabel(status: AccessStatus): string {
  switch (status) {
    case "full":
      return "Full access";
    case "writeOnly":
      return "Add only";
    case "denied":
      return "Denied";
    case "notDetermined":
      return "Not asked yet";
  }
}

export function SettingsPopover({ onClose }: { onClose: () => void }) {
  const workspace = useApp((s) => s.workspace);
  const refresh = useApp((s) => s.refresh);
  const showInGrid = useApp((s) => s.workspace?.preferences.showRemindersInGrid ?? false);
  const setShowInGrid = useApp((s) => s.setShowRemindersInGrid);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  if (!workspace) return null;

  const row = (label: string, status: AccessStatus, url: string) => (
    <div className={styles.row}>
      <span className={styles.label}>{label}</span>
      <span className={styles.value}>
        <span className={styles.status} data-ok={status === "full"} data-bad={status === "denied"} />
        {accessLabel(status)}
        {status !== "full" && (
          <button type="button" className={styles.link} onClick={() => (status === "notDetermined" ? void refresh() : void openExternal(url))}>
            {status === "notDetermined" ? "Ask" : "Settings"}
          </button>
        )}
      </span>
    </div>
  );

  // Portalled: the sidebar's backdrop-filter would otherwise clip a fixed child.
  return createPortal(
    <div ref={ref} className={styles.popover} role="dialog" aria-label="Settings">
      <div className={styles.title}>Settings</div>
      <div className={styles.row}>
        <span className={styles.label}>Data source</span>
        <span className={styles.value}>{workspace.providerName}</span>
      </div>
      {row("Calendars", workspace.eventAccess, SETTINGS_CALENDARS_URL)}
      {row("Reminders", workspace.reminderAccess, SETTINGS_REMINDERS_URL)}
      <label className={styles.option}>
        <Checkbox checked={showInGrid} label="Show timed tasks in the calendar grid" onChange={(v) => void setShowInGrid(v)} />
        Show timed tasks in the grid
      </label>
    </div>,
    document.body,
  );
}
