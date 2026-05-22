import { useLayoutEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
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

const followLatestThresholdPx = 24;

function formatReceivedAt(date: Date) {
  return `${timeFormatter.format(date)}.${String(date.getMilliseconds()).padStart(3, "0")}`;
}

function getDistanceFromBottom(viewport: HTMLDivElement) {
  return viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight;
}

function isNearBottom(viewport: HTMLDivElement) {
  return getDistanceFromBottom(viewport) <= followLatestThresholdPx;
}

function scrollToBottom(viewport: HTMLDivElement) {
  viewport.scrollTop = viewport.scrollHeight;
}

export function NmeaLogView({ logEntries, maxLogEntries }: NmeaLogViewProps) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const previousLastLogEntryIdRef = useRef(0);
  const [isFollowingLatest, setIsFollowingLatest] = useState(true);
  const [hasUnseenLatest, setHasUnseenLatest] = useState(false);
  const lastLogEntryId = logEntries.at(-1)?.id ?? 0;

  useLayoutEffect(() => {
    const viewport = viewportRef.current;

    if (!viewport) {
      return;
    }

    if (lastLogEntryId === 0) {
      previousLastLogEntryIdRef.current = 0;
      setHasUnseenLatest(false);
      setIsFollowingLatest(true);
      return;
    }

    const hasNewLogEntry = lastLogEntryId !== previousLastLogEntryIdRef.current;
    previousLastLogEntryIdRef.current = lastLogEntryId;

    if (!hasNewLogEntry) {
      return;
    }

    if (isFollowingLatest || isNearBottom(viewport)) {
      scrollToBottom(viewport);
      setHasUnseenLatest(false);
      setIsFollowingLatest(true);
      return;
    }

    setHasUnseenLatest(true);
  }, [isFollowingLatest, lastLogEntryId]);

  const handleViewportScroll = () => {
    const viewport = viewportRef.current;

    if (!viewport) {
      return;
    }

    const nextIsFollowingLatest = isNearBottom(viewport);
    setIsFollowingLatest(nextIsFollowingLatest);

    if (nextIsFollowingLatest) {
      setHasUnseenLatest(false);
    }
  };

  const handleFollowLatest = () => {
    const viewport = viewportRef.current;

    if (!viewport) {
      return;
    }

    scrollToBottom(viewport);
    setIsFollowingLatest(true);
    setHasUnseenLatest(false);
  };

  return (
    <Card className="min-h-[28rem] bg-slate-950 text-slate-100" size="sm">
      <CardHeader className="border-b border-slate-800">
        <CardTitle className="text-white">NMEAセンテンス</CardTitle>
        <CardAction className="text-xs text-slate-400">最新 {maxLogEntries} 行</CardAction>
      </CardHeader>
      <CardContent className="relative min-h-0 flex-1 p-0">
        <ScrollArea
          className="h-[28rem]"
          viewportRef={viewportRef}
          onViewportScroll={handleViewportScroll}
        >
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
        {hasUnseenLatest ? (
          <Button
            type="button"
            size="sm"
            className="absolute right-4 bottom-4 shadow-lg"
            onClick={handleFollowLatest}
          >
            最新へ
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}
