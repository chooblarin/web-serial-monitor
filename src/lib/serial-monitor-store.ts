import { createLineBuffer, type LineBuffer } from "@/lib/nmea-line-buffer";

export type ConnectionStatus = "idle" | "connecting" | "connected" | "disconnecting";

export type LogEntry = {
  id: number;
  receivedAt: Date;
  sentence: string;
};

export const baudRates = [4800, 9600, 19200, 38400, 57600, 115200] as const;
export type BaudRate = (typeof baudRates)[number];

export const maxLogEntries = 500;
export const defaultBaudRate: BaudRate = 115200;

const maxPendingTextLength = 8192;
const baudRateStorageKey = "web-serial-monitor:baud-rate";

type BaudRateStorage = Pick<Storage, "getItem" | "setItem">;

/** Schedules a flush and returns a function that cancels it. */
type FlushScheduler = (callback: () => void) => () => void;

export type SerialMonitorStoreOptions = {
  serial?: Serial;
  storage?: BaudRateStorage;
  scheduleFlush?: FlushScheduler;
};

function isBaudRate(value: number): value is BaudRate {
  return (baudRates as readonly number[]).includes(value);
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

/**
 * Default flush scheduler. Coalesces log updates to one per animation frame so
 * a fast serial stream cannot trigger a re-render storm. Falls back to a timer
 * when `requestAnimationFrame` is unavailable (e.g. a background tab or tests).
 */
const defaultScheduleFlush: FlushScheduler = (callback) => {
  if (typeof requestAnimationFrame === "function") {
    const handle = requestAnimationFrame(() => callback());
    return () => cancelAnimationFrame(handle);
  }

  const handle = setTimeout(callback, 16);
  return () => clearTimeout(handle);
};

/**
 * Framework-agnostic store for a single Web Serial NMEA connection.
 *
 * All serial I/O, the connection state machine, and log batching live here so
 * they can be unit tested without React. The React layer subscribes through
 * `useSyncExternalStore` using the stable `subscribe`/`get*` members.
 */
export class SerialMonitorStore {
  private readonly listeners = new Set<() => void>();
  private readonly serial?: Serial;
  private readonly storage?: BaudRateStorage;
  private readonly scheduleFlush: FlushScheduler;

  private _status: ConnectionStatus = "idle";
  private _logEntries: LogEntry[] = [];
  private _errorMessage: string | null = null;
  private _baudRate: BaudRate;

  private port: SerialPort | null = null;
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private readLoopPromise: Promise<void> | null = null;
  private readonly lineBuffer: LineBuffer = createLineBuffer(maxPendingTextLength);
  private queuedLogEntries: LogEntry[] = [];
  private flushScheduled = false;
  private cancelScheduledFlush: (() => void) | null = null;
  private nextLogId = 1;
  private disconnectRequested = false;
  private oversizedBufferWarning = false;

  readonly isSerialSupported: boolean;

  constructor(options: SerialMonitorStoreOptions = {}) {
    this.serial =
      options.serial ?? (typeof navigator !== "undefined" ? navigator.serial : undefined);
    this.storage =
      options.storage ?? (typeof window !== "undefined" ? window.localStorage : undefined);
    this.scheduleFlush = options.scheduleFlush ?? defaultScheduleFlush;
    this.isSerialSupported = Boolean(this.serial);
    this._baudRate = this.readStoredBaudRate();
  }

  // --- useSyncExternalStore bindings (stable identities) ---

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getStatus = (): ConnectionStatus => this._status;
  getLogEntries = (): LogEntry[] => this._logEntries;
  getErrorMessage = (): string | null => this._errorMessage;
  getBaudRate = (): BaudRate => this._baudRate;

  // --- Commands ---

  connect = async (): Promise<void> => {
    if (!this.serial || this._status !== "idle") {
      return;
    }

    this.setErrorMessage(null);
    this.setStatus("connecting");
    this.disconnectRequested = false;
    this.oversizedBufferWarning = false;

    try {
      const port = await this.serial.requestPort();
      await port.open({
        baudRate: this._baudRate,
        dataBits: 8,
        stopBits: 1,
        parity: "none",
        flowControl: "none",
      });
      this.port = port;
      this.setStatus("connected");
      this.readLoopPromise = this.readFromPort(port);
    } catch (error) {
      this.setErrorMessage(formatError(error));
      this.setStatus("idle");
    }
  };

  disconnect = async (): Promise<void> => {
    const port = this.port;

    if (!port || this._status !== "connected") {
      return;
    }

    this.setStatus("disconnecting");
    this.setErrorMessage(null);
    this.disconnectRequested = true;

    try {
      await this.reader?.cancel().catch(() => undefined);
      await this.readLoopPromise;
    } catch (error) {
      this.setErrorMessage(formatError(error));
    } finally {
      await closePortQuietly(port);
      this.port = null;
      this.reader = null;
      this.readLoopPromise = null;
      this.lineBuffer.reset();
      this.flushQueuedLogEntries();
      this.setStatus("idle");
    }
  };

  clearLog = (): void => {
    this.queuedLogEntries = [];
    this.cancelPendingFlush();
    if (this._logEntries.length > 0) {
      this._logEntries = [];
      this.emit();
    }
  };

  setBaudRate = (baudRate: BaudRate): void => {
    if (this._baudRate === baudRate) {
      return;
    }

    this._baudRate = baudRate;
    this.writeStoredBaudRate(baudRate);
    this.emit();
  };

  // --- Internals ---

  private emit() {
    for (const listener of this.listeners) {
      listener();
    }
  }

  private setStatus(status: ConnectionStatus) {
    if (this._status !== status) {
      this._status = status;
      this.emit();
    }
  }

  private setErrorMessage(message: string | null) {
    if (this._errorMessage !== message) {
      this._errorMessage = message;
      this.emit();
    }
  }

  private readStoredBaudRate(): BaudRate {
    try {
      const stored = Number(this.storage?.getItem(baudRateStorageKey));
      return isBaudRate(stored) ? stored : defaultBaudRate;
    } catch {
      return defaultBaudRate;
    }
  }

  private writeStoredBaudRate(baudRate: BaudRate) {
    try {
      this.storage?.setItem(baudRateStorageKey, String(baudRate));
    } catch {
      // Ignore storage failures (private mode, disabled storage, etc.).
    }
  }

  private cancelPendingFlush() {
    this.flushScheduled = false;
    if (this.cancelScheduledFlush) {
      this.cancelScheduledFlush();
      this.cancelScheduledFlush = null;
    }
  }

  private flushQueuedLogEntries = () => {
    this.cancelPendingFlush();

    if (this.queuedLogEntries.length === 0) {
      return;
    }

    const queued = this.queuedLogEntries;
    this.queuedLogEntries = [];
    this._logEntries = [...this._logEntries, ...queued].slice(-maxLogEntries);
    this.emit();
  };

  private enqueueLogEntries(entries: LogEntry[]) {
    if (entries.length === 0) {
      return;
    }

    this.queuedLogEntries = [...this.queuedLogEntries, ...entries].slice(-maxLogEntries);

    // Guard on a boolean rather than the cancel handle: a synchronous scheduler
    // runs the callback (which nulls the handle) *before* the assignment below
    // returns, so the handle would be left non-null and block every later flush.
    if (this.flushScheduled) {
      return;
    }

    this.flushScheduled = true;
    this.cancelScheduledFlush = this.scheduleFlush(() => {
      this.flushScheduled = false;
      this.cancelScheduledFlush = null;
      this.flushQueuedLogEntries();
    });
  }

  private appendReceiveChunk(chunk: string) {
    const { lines, overflowed } = this.lineBuffer.push(chunk);

    if (overflowed && !this.oversizedBufferWarning) {
      this.oversizedBufferWarning = true;
      this.setErrorMessage(
        "改行が見つからない受信データが続いています。ボーレートまたは接続先ポートを確認してください。",
      );
    } else if (!overflowed && lines.length > 0 && this.oversizedBufferWarning) {
      // Line endings are coming through again, so the earlier warning is stale.
      this.oversizedBufferWarning = false;
      this.setErrorMessage(null);
    }

    if (lines.length === 0) {
      return;
    }

    const receivedAt = new Date();
    const entries = lines.map((sentence) => ({
      id: this.nextLogId++,
      receivedAt,
      sentence,
    }));

    this.enqueueLogEntries(entries);
  }

  private async readFromPort(port: SerialPort) {
    const decoder = new TextDecoder();

    try {
      while (port.readable && !this.disconnectRequested) {
        const reader = port.readable.getReader();
        this.reader = reader;

        try {
          while (!this.disconnectRequested) {
            const { value, done } = await reader.read();

            if (done) {
              break;
            }

            if (value) {
              this.appendReceiveChunk(decoder.decode(value, { stream: true }));
            }
          }
        } finally {
          reader.releaseLock();
          if (this.reader === reader) {
            this.reader = null;
          }
        }
      }

      // Flush any bytes the decoder held back across the final chunk boundary.
      const tail = decoder.decode();
      if (tail) {
        this.appendReceiveChunk(tail);
      }

      if (!this.disconnectRequested) {
        this.setErrorMessage("シリアルポートが切断されました。");
      }
    } catch (error) {
      if (!this.disconnectRequested) {
        this.setErrorMessage(formatError(error));
      }
    } finally {
      if (!this.disconnectRequested) {
        await closePortQuietly(port);
      }

      if (this.port === port) {
        this.port = null;
      }

      this.lineBuffer.reset();
      this.readLoopPromise = null;
      this.flushQueuedLogEntries();
      this.setStatus("idle");
    }
  }

  /** Test seam: resolves once the active read loop has fully unwound. */
  async waitForReadLoop(): Promise<void> {
    await this.readLoopPromise;
  }
}
