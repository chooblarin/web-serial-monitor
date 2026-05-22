import { useRef, useState } from "react";

type BrowserSerial = {
  requestPort(options?: SerialPortRequestOptions): Promise<SerialPort>;
};

type SerialPortRequestOptions = {
  filters?: Array<{
    usbVendorId?: number;
    usbProductId?: number;
  }>;
};

type SerialPort = {
  readable: ReadableStream<Uint8Array> | null;
  open(options: SerialOptions): Promise<void>;
  close(): Promise<void>;
};

type SerialOptions = {
  baudRate: number;
  dataBits?: 7 | 8;
  stopBits?: 1 | 2;
  parity?: "none" | "even" | "odd";
  bufferSize?: number;
  flowControl?: "none" | "hardware";
};

type SerialNavigator = Navigator & {
  serial?: BrowserSerial;
};

type ConnectionStatus = "idle" | "connecting" | "connected" | "disconnecting";

type LogEntry = {
  id: number;
  receivedAt: Date;
  sentence: string;
};

const baudRates = [4800, 9600, 19200, 38400, 57600, 115200] as const;
const maxLogEntries = 500;
const maxPendingTextLength = 8192;
const logFlushIntervalMs = 100;

const timeFormatter = new Intl.DateTimeFormat(undefined, {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

function getSerialNavigator() {
  return navigator as SerialNavigator;
}

function formatReceivedAt(date: Date) {
  return `${timeFormatter.format(date)}.${String(date.getMilliseconds()).padStart(3, "0")}`;
}

function formatError(error: unknown) {
  if (error instanceof DOMException && error.name === "NotFoundError") {
    return "ポートが選択されませんでした。";
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "不明なエラーが発生しました。";
}

async function closePortQuietly(port: SerialPort) {
  try {
    await port.close();
  } catch {
    // The port may already be closed after device removal.
  }
}

function App() {
  const serial = getSerialNavigator().serial;
  const isSerialSupported = Boolean(serial);
  const [baudRate, setBaudRate] = useState<(typeof baudRates)[number]>(115200);
  const [status, setStatus] = useState<ConnectionStatus>("idle");
  const [logEntries, setLogEntries] = useState<LogEntry[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const portRef = useRef<SerialPort | null>(null);
  const readerRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null);
  const readLoopPromiseRef = useRef<Promise<void> | null>(null);
  const pendingTextRef = useRef("");
  const queuedLogEntriesRef = useRef<LogEntry[]>([]);
  const logFlushTimerRef = useRef<number | null>(null);
  const nextLogIdRef = useRef(1);
  const disconnectRequestedRef = useRef(false);
  const oversizedBufferWarningRef = useRef(false);

  const flushQueuedLogEntries = () => {
    if (logFlushTimerRef.current !== null) {
      window.clearTimeout(logFlushTimerRef.current);
      logFlushTimerRef.current = null;
    }

    const queuedEntries = queuedLogEntriesRef.current;

    if (queuedEntries.length === 0) {
      return;
    }

    queuedLogEntriesRef.current = [];
    setLogEntries((currentEntries) => [...currentEntries, ...queuedEntries].slice(-maxLogEntries));
  };

  const scheduleLogFlush = () => {
    if (logFlushTimerRef.current !== null) {
      return;
    }

    logFlushTimerRef.current = window.setTimeout(flushQueuedLogEntries, logFlushIntervalMs);
  };

  const appendReceiveChunk = (chunk: string) => {
    pendingTextRef.current += chunk;

    if (pendingTextRef.current.length > maxPendingTextLength) {
      pendingTextRef.current = pendingTextRef.current.slice(-maxPendingTextLength);

      if (!oversizedBufferWarningRef.current) {
        oversizedBufferWarningRef.current = true;
        setErrorMessage(
          "改行が見つからない受信データが続いています。ボーレートまたは接続先ポートを確認してください。",
        );
      }
    }

    const parts = pendingTextRef.current.split(/\r?\n/);
    pendingTextRef.current = parts.pop() ?? "";
    const receivedAt = new Date();
    const nextEntries = parts
      .map((line) => line.replace(/\r$/, ""))
      .filter(Boolean)
      .map((sentence) => ({
        id: nextLogIdRef.current++,
        receivedAt,
        sentence,
      }));

    if (nextEntries.length === 0) {
      return;
    }

    queuedLogEntriesRef.current = [...queuedLogEntriesRef.current, ...nextEntries].slice(
      -maxLogEntries,
    );
    scheduleLogFlush();
  };

  const readFromPort = async (port: SerialPort) => {
    const decoder = new TextDecoder();

    try {
      while (port.readable && !disconnectRequestedRef.current) {
        const reader = port.readable.getReader();
        readerRef.current = reader;

        try {
          while (!disconnectRequestedRef.current) {
            const { value, done } = await reader.read();

            if (done) {
              break;
            }

            if (value) {
              appendReceiveChunk(decoder.decode(value, { stream: true }));
            }
          }
        } finally {
          reader.releaseLock();
          if (readerRef.current === reader) {
            readerRef.current = null;
          }
        }
      }

      if (!disconnectRequestedRef.current) {
        setErrorMessage("シリアルポートが切断されました。");
      }
    } catch (error) {
      if (!disconnectRequestedRef.current) {
        setErrorMessage(formatError(error));
      }
    } finally {
      if (!disconnectRequestedRef.current) {
        await closePortQuietly(port);
      }

      if (portRef.current === port) {
        portRef.current = null;
      }

      pendingTextRef.current = "";
      readLoopPromiseRef.current = null;
      flushQueuedLogEntries();
      setStatus("idle");
    }
  };

  const handleConnect = async () => {
    if (!serial || status !== "idle") {
      return;
    }

    setErrorMessage(null);
    setStatus("connecting");
    disconnectRequestedRef.current = false;
    oversizedBufferWarningRef.current = false;

    try {
      const port = await serial.requestPort();
      await port.open({
        baudRate,
        dataBits: 8,
        stopBits: 1,
        parity: "none",
        flowControl: "none",
      });
      portRef.current = port;
      setStatus("connected");
      readLoopPromiseRef.current = readFromPort(port);
    } catch (error) {
      setErrorMessage(formatError(error));
      setStatus("idle");
    }
  };

  const handleDisconnect = async () => {
    const port = portRef.current;

    if (!port || status !== "connected") {
      return;
    }

    setStatus("disconnecting");
    setErrorMessage(null);
    disconnectRequestedRef.current = true;

    try {
      await readerRef.current?.cancel().catch(() => undefined);
      await readLoopPromiseRef.current;
    } catch (error) {
      setErrorMessage(formatError(error));
    } finally {
      await closePortQuietly(port);
      portRef.current = null;
      readerRef.current = null;
      readLoopPromiseRef.current = null;
      pendingTextRef.current = "";
      flushQueuedLogEntries();
      setStatus("idle");
    }
  };

  const isBusy = status === "connecting" || status === "disconnecting";
  const canConnect = isSerialSupported && status === "idle";
  const canDisconnect = status === "connected";

  return (
    <main className="min-h-svh bg-slate-50">
      <div className="mx-auto flex min-h-svh w-full max-w-7xl flex-col px-4 py-5 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-4 border-b border-slate-200 pb-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-medium text-sky-700">QZ1 NMEA-0183 Monitor</p>
            <h1 className="mt-1 text-3xl font-semibold text-slate-950 sm:text-4xl">
              Web Serial Monitor
            </h1>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <label className="grid gap-1 text-sm font-medium text-slate-700">
              Baud rate
              <select
                className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-950 shadow-sm outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-200 disabled:bg-slate-100"
                value={baudRate}
                disabled={status !== "idle"}
                onChange={(event) =>
                  setBaudRate(Number(event.currentTarget.value) as (typeof baudRates)[number])
                }
              >
                {baudRates.map((rate) => (
                  <option key={rate} value={rate}>
                    {rate}
                  </option>
                ))}
              </select>
            </label>
            <button
              className="h-10 rounded-md bg-sky-700 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-800 focus:outline-none focus:ring-2 focus:ring-sky-300 disabled:cursor-not-allowed disabled:bg-slate-300"
              type="button"
              disabled={!canConnect || isBusy}
              onClick={handleConnect}
            >
              接続
            </button>
            <button
              className="h-10 rounded-md border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-800 shadow-sm transition hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-300 disabled:cursor-not-allowed disabled:text-slate-400"
              type="button"
              disabled={!canDisconnect || isBusy}
              onClick={handleDisconnect}
            >
              切断
            </button>
            <button
              className="h-10 rounded-md border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-800 shadow-sm transition hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-300 disabled:cursor-not-allowed disabled:text-slate-400"
              type="button"
              disabled={logEntries.length === 0}
              onClick={() => {
                queuedLogEntriesRef.current = [];
                flushQueuedLogEntries();
                setLogEntries([]);
              }}
            >
              ログ消去
            </button>
          </div>
        </header>

        <section className="grid gap-4 py-5 lg:grid-cols-[18rem_1fr]">
          <aside className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-950">状態</h2>
            <dl className="mt-4 grid gap-3 text-sm">
              <div>
                <dt className="text-slate-500">接続</dt>
                <dd className="mt-1 font-medium text-slate-950">
                  {status === "idle" && "未接続"}
                  {status === "connecting" && "接続中"}
                  {status === "connected" && "接続済み"}
                  {status === "disconnecting" && "切断中"}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">受信ログ</dt>
                <dd className="mt-1 font-medium text-slate-950">
                  {logEntries.length} / {maxLogEntries} 行
                </dd>
              </div>
            </dl>

            {!isSerialSupported && (
              <p className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                このブラウザは Web Serial API に対応していません。Chrome または Edge
                の最新版で開いてください。
              </p>
            )}

            {errorMessage && (
              <p className="mt-4 rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">
                {errorMessage}
              </p>
            )}
          </aside>

          <section className="flex min-h-[28rem] flex-col rounded-lg border border-slate-200 bg-slate-950 shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
              <h2 className="text-sm font-semibold text-white">NMEAセンテンス</h2>
              <span className="text-xs text-slate-400">最新 {maxLogEntries} 行</span>
            </div>
            <div className="min-h-0 flex-1 overflow-auto p-4">
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
          </section>
        </section>
      </div>
    </main>
  );
}

export default App;
