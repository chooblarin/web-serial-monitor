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

export type ConnectionStatus = "idle" | "connecting" | "connected" | "disconnecting";

export type LogEntry = {
  id: number;
  receivedAt: Date;
  sentence: string;
};

export const baudRates = [4800, 9600, 19200, 38400, 57600, 115200] as const;
export type BaudRate = (typeof baudRates)[number];

export const maxLogEntries = 500;

const maxPendingTextLength = 8192;
const logFlushIntervalMs = 100;

function getSerialNavigator() {
  return navigator as SerialNavigator;
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

export function useSerialMonitor() {
  const serial = getSerialNavigator().serial;
  const isSerialSupported = Boolean(serial);
  const [baudRate, setBaudRate] = useState<BaudRate>(115200);
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

  const connect = async () => {
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

  const disconnect = async () => {
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

  const clearLog = () => {
    queuedLogEntriesRef.current = [];
    flushQueuedLogEntries();
    setLogEntries([]);
  };

  const isBusy = status === "connecting" || status === "disconnecting";
  const canConnect = isSerialSupported && status === "idle";
  const canDisconnect = status === "connected";

  return {
    baudRate,
    canConnect,
    canDisconnect,
    clearLog,
    connect,
    disconnect,
    errorMessage,
    isBusy,
    isSerialSupported,
    logEntries,
    setBaudRate,
    status,
  };
}
