import { MonitorHeader } from "@/components/monitor-header";
import { NmeaLogView } from "@/components/nmea-log-view";
import { SerialControls } from "@/components/serial-controls";
import { StatusPanel } from "@/components/status-panel";
import { baudRates, maxLogEntries, useSerialMonitor } from "@/hooks/use-serial-monitor";

function App() {
  const monitor = useSerialMonitor();

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
            onDisconnect={monitor.disconnect}
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
