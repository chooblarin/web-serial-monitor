import type { LogEntry } from "@/hooks/use-serial-monitor";

const timeFormatter = new Intl.DateTimeFormat(undefined, {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

/** Format a received-at timestamp as HH:MM:SS.mmm for display and export. */
export function formatReceivedAt(date: Date): string {
  return `${timeFormatter.format(date)}.${String(date.getMilliseconds()).padStart(3, "0")}`;
}

/**
 * Render the Receive Log as plain text, one NMEA Sentence per line prefixed by
 * its received-at timestamp. Used for clipboard copy and file download.
 */
export function formatLogEntriesAsText(entries: LogEntry[]): string {
  return entries
    .map((entry) => `${formatReceivedAt(entry.receivedAt)}\t${entry.sentence}`)
    .join("\n");
}
