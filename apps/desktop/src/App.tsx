import { useEffect, useMemo } from "react";
import { StoreProvider } from "./application/context";
import { createAppStore, type AppStore } from "./application/store";
import { createBackend } from "./infrastructure/createBackend";
import { AppShell } from "./ui/layout/AppShell";

export function App({ store }: { store?: AppStore }) {
  const appStore = useMemo(() => store ?? createAppStore(createBackend()), [store]);
  useEffect(() => {
    void appStore.getState().init();
  }, [appStore]);
  return (
    <StoreProvider store={appStore}>
      <AppShell />
    </StoreProvider>
  );
}
