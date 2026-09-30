import { useCallback, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from "react";
import type { CalendarEvent } from "@/domain/model";
import { snapMinutes } from "@/domain/time";

export interface DragState {
  event: CalendarEvent;
  /** Day column under the pointer. */
  dayIndex: number;
  /** Snapped start minute for timed events; undefined for bars. */
  startMinutes?: number;
  durationMinutes: number;
  /** Whole-day shift relative to where the drag started (used by bars). */
  dayShift: number;
}

interface DragParams {
  /** The element whose left/top define the day columns and the minute axis. */
  columnsRef: RefObject<HTMLElement | null>;
  gutterWidth: number;
  hourHeight: number;
  dayCount: number;
  onDrop: (event: CalendarEvent, dayIndex: number, startMinutes: number | undefined, dayShift: number) => void;
}

const DRAG_THRESHOLD_PX = 4;

/**
 * Pointer-driven move for event blocks (time and day) and all-day bars (day
 * only). The hook owns the ghost geometry; the caller renders it.
 */
export function useDragMove({ columnsRef, gutterWidth, hourHeight, dayCount, onDrop }: DragParams) {
  const [drag, setDrag] = useState<DragState | null>(null);
  const pending = useRef<{
    event: CalendarEvent;
    startX: number;
    startY: number;
    grabMinutes: number;
    grabDayIndex: number;
    originMinutes: number;
    durationMinutes: number;
    isBar: boolean;
    moved: boolean;
  } | null>(null);

  const geometry = useCallback(
    (clientX: number, clientY: number) => {
      const el = columnsRef.current;
      if (!el) return null;
      const rect = el.getBoundingClientRect();
      const colWidth = (rect.width - gutterWidth) / dayCount;
      const dayIndex = Math.max(0, Math.min(dayCount - 1, Math.floor((clientX - rect.left - gutterWidth) / colWidth)));
      const minutes = ((clientY - rect.top) / hourHeight) * 60;
      return { dayIndex, minutes };
    },
    [columnsRef, gutterWidth, hourHeight, dayCount],
  );

  const onPointerDown = useCallback(
    (e: ReactPointerEvent, event: CalendarEvent, originMinutes: number, durationMinutes: number, isBar: boolean) => {
      if (e.button !== 0 || event.readOnly) return;
      const g = geometry(e.clientX, e.clientY);
      pending.current = {
        event,
        startX: e.clientX,
        startY: e.clientY,
        grabMinutes: g ? g.minutes - originMinutes : 0,
        grabDayIndex: g ? g.dayIndex : 0,
        originMinutes,
        durationMinutes,
        isBar,
        moved: false,
      };
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    },
    [geometry],
  );

  const onPointerMove = useCallback(
    (e: ReactPointerEvent) => {
      const p = pending.current;
      if (!p) return;
      if (!p.moved && Math.hypot(e.clientX - p.startX, e.clientY - p.startY) < DRAG_THRESHOLD_PX) return;
      p.moved = true;
      const g = geometry(e.clientX, e.clientY);
      if (!g) return;
      const startMinutes = p.isBar ? undefined : snapMinutes(Math.min(24 * 60 - p.durationMinutes, g.minutes - p.grabMinutes));
      setDrag({ event: p.event, dayIndex: g.dayIndex, startMinutes, durationMinutes: p.durationMinutes, dayShift: g.dayIndex - p.grabDayIndex });
    },
    [geometry],
  );

  const onPointerUp = useCallback(
    (e: ReactPointerEvent) => {
      const p = pending.current;
      pending.current = null;
      if (!p) return false;
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      if (!p.moved) {
        setDrag(null);
        return false;
      }
      const g = geometry(e.clientX, e.clientY);
      setDrag(null);
      if (!g) return true;
      const startMinutes = p.isBar ? undefined : snapMinutes(Math.min(24 * 60 - p.durationMinutes, g.minutes - p.grabMinutes));
      onDrop(p.event, g.dayIndex, startMinutes, g.dayIndex - p.grabDayIndex);
      return true;
    },
    [geometry, onDrop],
  );

  const cancel = useCallback(() => {
    pending.current = null;
    setDrag(null);
  }, []);

  return { drag, onPointerDown, onPointerMove, onPointerUp, cancel };
}
