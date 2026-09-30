import { createContext, useContext, type ReactNode } from "react";
import { useStore } from "zustand";
import type { AppActions, AppState, AppStore } from "./store";

const StoreContext = createContext<AppStore | null>(null);

export function StoreProvider({ store, children }: { store: AppStore; children: ReactNode }) {
  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>;
}

export function useAppStore(): AppStore {
  const store = useContext(StoreContext);
  if (!store) throw new Error("useAppStore must be used inside <StoreProvider>");
  return store;
}

/** Subscribe to a slice of state; re-renders only when the slice changes. */
export function useApp<T>(selector: (state: AppState & AppActions) => T): T {
  return useStore(useAppStore(), selector);
}
