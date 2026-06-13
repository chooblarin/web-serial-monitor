import { useEffect, useState } from "react";

import { MonitorHeader } from "@/components/monitor-header";
import { NmeaLogView } from "@/components/nmea-log-view";
import { SerialControls } from "@/components/serial-controls";
import { StatusPanel } from "@/components/status-panel";
import { baudRates, maxLogEntries, useSerialMonitor } from "@/hooks/use-serial-monitor";
import { formatLogEntriesAsText } from "@/lib/log-export";

type CopyState = "idle" | "copied" | "error";

const copyFeedbackDurationMs = 2000;

const copyLabels: Record<CopyState, string> = {
  idle: "コピー",
  copied: "コピーしました",
  error: "コピー失敗",
};

function buildLogFileName(date: Date) {
  const pad = (value: number) => String(value).padStart(2, "0");
  const stamp = `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(
    date.getHours(),
  )}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
  return `nmea-log-${stamp}.txt`;
}

function App() {
  const monitor = useSerialMonitor();
  const [copyState, setCopyState] = useState<CopyState>("idle");

  useEffect(() => {
    if (copyState === "idle") {
      return;
    }

    const timer = window.setTimeout(() => setCopyState("idle"), copyFeedbackDurationMs);
    return () => window.clearTimeout(timer);
  }, [copyState]);

  const handleCopyLog = async () => {
    try {
      if (!navigator.clipboard) {
        throw new Error("Clipboard API is unavailable.");
      }
      await navigator.clipboard.writeText(formatLogEntriesAsText(monitor.logEntries));
      setCopyState("copied");
    } catch {
      setCopyState("error");
    }
  };

  const handleSaveLog = () => {
    const text = formatLogEntriesAsText(monitor.logEntries);
    const blob = new Blob([`${text}\n`], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = buildLogFileName(new Date());
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <main className="min-h-svh bg-background">
      <div className="mx-auto flex min-h-svh w-full max-w-7xl flex-col px-4 py-5 sm:px-6 lg:px-8">
        <MonitorHeader>
          <SerialControls
            baudRate={monitor.baudRate}
            baudRates={baudRates}
            canConnect={monitor.canConnect}
            canDisconnect={monitor.canDisconnect}
            hasLogEntries={monitor.logEntries.length > 0}
            isBusy={monitor.isBusy}
            onBaudRateChange={monitor.setBaudRate}
            onClearLog={monitor.clearLog}
            onConnect={monitor.connect}
            onCopyLog={handleCopyLog}
            copyLabel={copyLabels[copyState]}
            onDisconnect={monitor.disconnect}
            onSaveLog={handleSaveLog}
          />
        </MonitorHeader>

        <section className="grid gap-4 py-5 lg:grid-cols-[18rem_1fr]">
          <StatusPanel
            errorMessage={monitor.errorMessage}
            isSerialSupported={monitor.isSerialSupported}
            logEntryCount={monitor.logEntries.length}
            maxLogEntries={maxLogEntries}
            status={monitor.status}
          />
          <NmeaLogView logEntries={monitor.logEntries} maxLogEntries={maxLogEntries} />
        </section>
      </div>
    </main>
  );
}

export default App;
