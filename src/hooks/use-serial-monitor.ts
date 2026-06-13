import { useRef, useSyncExternalStore } from "react";

import { SerialMonitorStore } from "@/lib/serial-monitor-store";

export { baudRates, defaultBaudRate, maxLogEntries } from "@/lib/serial-monitor-store";
export type { BaudRate, ConnectionStatus, LogEntry } from "@/lib/serial-monitor-store";

export function useSerialMonitor() {
  const storeRef = useRef<SerialMonitorStore | null>(null);
  storeRef.current ??= new SerialMonitorStore();
  const store = storeRef.current;

  const status = useSyncExternalStore(store.subscribe, store.getStatus);
  const logEntries = useSyncExternalStore(store.subscribe, store.getLogEntries);
  const errorMessage = useSyncExternalStore(store.subscribe, store.getErrorMessage);
  const baudRate = useSyncExternalStore(store.subscribe, store.getBaudRate);

  return {
    baudRate,
    canConnect: store.isSerialSupported && status === "idle",
    canDisconnect: status === "connected",
    clearLog: store.clearLog,
    connect: store.connect,
    disconnect: store.disconnect,
    errorMessage,
    isBusy: status === "connecting" || status === "disconnecting",
    isSerialSupported: store.isSerialSupported,
    logEntries,
    setBaudRate: store.setBaudRate,
    status,
  };
}
