import { useEffect, useRef, useState } from "react";
import { useApp } from "@/application/context";
import { formatDayTitle, formatMonthTitle, type ViewMode } from "@/domain/time";
import { Icon } from "../common/Icon";
import { Segmented } from "../common/Segmented";
import { SearchResults } from "../search/SearchResults";
import styles from "./Toolbar.module.css";

const VIEWS: { value: ViewMode; label: string }[] = [
  { value: "day", label: "Day" },
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
];

const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

export function Toolbar() {
  const view = useApp((s) => s.view);
  const anchor = useApp((s) => s.anchor);
  const setView = useApp((s) => s.setView);
  const step = useApp((s) => s.step);
  const goToToday = useApp((s) => s.goToToday);
  const searchQuery = useApp((s) => s.searchQuery);
  const setSearchQuery = useApp((s) => s.setSearchQuery);
  const searchOpen = useApp((s) => s.searchOpen);
  const setSearchOpen = useApp((s) => s.setSearchOpen);
  const openEditor = useApp((s) => s.openEditor);
  const [menuOpen, setMenuOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [menuOpen]);

  const newEvent = () => {
    setMenuOpen(false);
    openEditor({ kind: "event", mode: "create", draft: { calendarId: "", title: "", time: { kind: "allDay", first: "", last: "" } } });
  };
  const newReminder = () => {
    setMenuOpen(false);
    openEditor({ kind: "reminder", mode: "create", draft: { listId: "", title: "" } });
  };

  const title = view === "day" ? formatDayTitle(anchor) : formatMonthTitle(anchor);

  return (
    <header className={styles.bar} data-tauri-drag-region>
      <div className={styles.nav}>
        <button type="button" className={styles.navBtn} aria-label="Previous" onClick={() => step(-1)}>
          <Icon name="chevronLeft" size={15} strokeWidth={2} />
        </button>
        <button type="button" className={styles.navBtn} aria-label="Next" onClick={() => step(1)}>
          <Icon name="chevronRight" size={15} strokeWidth={2} />
        </button>
        <button type="button" className={[styles.navBtn, styles.todayBtn].join(" ")} onClick={goToToday}>
          Today
        </button>
      </div>
      <h1 className={styles.title}>{title}</h1>
      <div className={styles.center}>
        <Segmented value={view} options={VIEWS} onChange={setView} ariaLabel="Calendar view" />
      </div>
      <div className={styles.right}>
        <div className={styles.search}>
          <Icon name="search" size={15} />
          <input
            ref={searchRef}
            className={styles.searchInput}
            type="search"
            placeholder="Search events, tasks…"
            aria-label="Search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onFocus={() => searchQuery && setSearchOpen(true)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setSearchQuery("");
                (e.target as HTMLInputElement).blur();
              }
            }}
          />
          <span className={styles.kbd}>{isMac ? "⌘" : "Ctrl"} K</span>
          {searchOpen && <SearchResults onClose={() => setSearchOpen(false)} />}
        </div>
        <div className={styles.add} ref={menuRef}>
          <button type="button" className={styles.addMain} onClick={newEvent}>
            <Icon name="plus" size={15} strokeWidth={2.4} />
            Add
          </button>
          <button type="button" className={styles.addMore} aria-label="More ways to add" aria-expanded={menuOpen} onClick={() => setMenuOpen((o) => !o)}>
            <Icon name="chevronDown" size={13} strokeWidth={2.2} />
          </button>
          {menuOpen && (
            <div className={styles.menu} role="menu">
              <button type="button" role="menuitem" className={styles.menuItem} onClick={newEvent}>
                <Icon name="calendar" size={14} /> New event
              </button>
              <button type="button" role="menuitem" className={styles.menuItem} onClick={newReminder}>
                <Icon name="bell" size={14} /> New reminder
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
