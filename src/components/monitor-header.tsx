import type { ReactNode } from "react";

type MonitorHeaderProps = {
  children: ReactNode;
};

export function MonitorHeader({ children }: MonitorHeaderProps) {
  return (
    <header className="flex flex-col gap-4 border-b border-border pb-5 lg:flex-row lg:items-end lg:justify-between">
      <div>
        <p className="text-sm font-medium text-primary">QZ1 NMEA-0183 Monitor</p>
        <h1 className="mt-1 text-3xl font-semibold text-foreground sm:text-4xl">
          Web Serial Monitor
        </h1>
      </div>
      {children}
    </header>
  );
}
