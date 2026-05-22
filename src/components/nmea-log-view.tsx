import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { LogEntry } from "@/hooks/use-serial-monitor";

type NmeaLogViewProps = {
  logEntries: LogEntry[];
  maxLogEntries: number;
};

const timeFormatter = new Intl.DateTimeFormat(undefined, {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

function formatReceivedAt(date: Date) {
  return `${timeFormatter.format(date)}.${String(date.getMilliseconds()).padStart(3, "0")}`;
}

export function NmeaLogView({ logEntries, maxLogEntries }: NmeaLogViewProps) {
  return (
    <Card className="min-h-[28rem] bg-slate-950 text-slate-100" size="sm">
      <CardHeader className="border-b border-slate-800">
        <CardTitle className="text-white">NMEAセンテンス</CardTitle>
        <CardAction className="text-xs text-slate-400">最新 {maxLogEntries} 行</CardAction>
      </CardHeader>
      <CardContent className="min-h-0 flex-1 p-0">
        <ScrollArea className="h-[28rem]">
          <div className="p-5">
            {logEntries.length === 0 ? (
              <p className="font-mono text-sm text-slate-500">
                接続すると受信した NMEAセンテンスがここに表示されます。
              </p>
            ) : (
              <ol className="grid gap-1 font-mono text-sm leading-6">
                {logEntries.map((entry) => (
                  <li className="grid gap-3 sm:grid-cols-[7.5rem_1fr]" key={entry.id}>
                    <time className="text-slate-500">{formatReceivedAt(entry.receivedAt)}</time>
                    <span className="break-all text-emerald-200">{entry.sentence}</span>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
