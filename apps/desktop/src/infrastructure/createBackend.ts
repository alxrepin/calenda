import type { Backend } from "@/application/backend";
import { createMockBackend } from "./mockBackend";
import { createTauriBackend } from "./tauriBackend";

declare global {
  interface Window {
    __TAURI_INTERNALS__?: unknown;
  }
}

export function isTauri(): boolean {
  return typeof window !== "undefined" && window.__TAURI_INTERNALS__ !== undefined;
}

/** Tauri when running inside the shell, otherwise the browser mock. */
export function createBackend(): Backend {
  return isTauri() ? createTauriBackend() : createMockBackend();
}
