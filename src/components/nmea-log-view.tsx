import { Check, Copy } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { LogEntry } from "@/hooks/use-serial-monitor";
import { copyTextToClipboard } from "@/lib/clipboard";
import { formatReceivedAt } from "@/lib/log-export";

type NmeaLogViewProps = {
  logEntries: LogEntry[];
  maxLogEntries: number;
};

const followLatestThresholdPx = 24;
const copyFeedbackDurationMs = 1500;

function NmeaLogRow({ entry }: { entry: LogEntry }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) {
      return;
    }

    const timer = window.setTimeout(() => setCopied(false), copyFeedbackDurationMs);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const handleCopy = async () => {
    setCopied(await copyTextToClipboard(entry.sentence));
  };

  return (
    <li className="group grid gap-3 sm:grid-cols-[7.5rem_1fr]">
      <time className="text-slate-500">{formatReceivedAt(entry.receivedAt)}</time>
      <div className="flex items-start justify-between gap-2">
        <span className="break-all text-emerald-200">{entry.sentence}</span>
        <button
          type="button"
          onClick={handleCopy}
          aria-label={`${entry.sentence} をコピー`}
          className="mt-0.5 shrink-0 rounded p-1 text-slate-500 opacity-0 transition hover:text-slate-200 focus-visible:opacity-100 focus-visible:ring-1 focus-visible:ring-slate-500 focus-visible:outline-none group-hover:opacity-100"
        >
          {copied ? (
            <Check className="size-3.5 text-emerald-300" aria-hidden="true" />
          ) : (
            <Copy className="size-3.5" aria-hidden="true" />
          )}
        </button>
      </div>
    </li>
  );
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
                  <NmeaLogRow entry={entry} key={entry.id} />
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
