import { describe, expect, it } from "vite-plus/test";

import { defaultBaudRate, SerialMonitorStore } from "@/lib/serial-monitor-store";

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/** Flush synchronously so log assertions don't depend on animation frames. */
const synchronousFlush = (callback: () => void) => {
  callback();
  return () => {};
};

function createMemoryStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
  };
}

/**
 * A fake SerialPort whose readable stream yields the given chunks and then
 * blocks, mirroring a real receiver that stays open waiting for more data.
 * `cancel()` (triggered by disconnect) unblocks it.
 */
function createFakePort(chunks: Uint8Array[]): SerialPort {
  let closed = false;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(chunk);
      }
    },
    pull() {
      // No more data for now; stay open until cancelled.
      return new Promise<void>(() => {});
    },
    cancel() {
      closed = true;
    },
  });

  return {
    get readable() {
      return closed ? null : stream;
    },
    open: async () => {},
    close: async () => {
      closed = true;
    },
  } as unknown as SerialPort;
}

function createFakeSerial(port: SerialPort): Serial {
  return { requestPort: async () => port } as unknown as Serial;
}

function encodeChunks(...texts: string[]): Uint8Array[] {
  const encoder = new TextEncoder();
  return texts.map((text) => encoder.encode(text));
}

describe("SerialMonitorStore", () => {
  it("starts idle and reports serial support based on the navigator", () => {
    const supported = new SerialMonitorStore({ serial: createFakeSerial(createFakePort([])) });
    expect(supported.isSerialSupported).toBe(true);
    expect(supported.getStatus()).toBe("idle");

    const unsupported = new SerialMonitorStore({ serial: undefined });
    expect(unsupported.isSerialSupported).toBe(false);
  });

  it("transitions through connect and disconnect", async () => {
    const store = new SerialMonitorStore({
      serial: createFakeSerial(createFakePort(encodeChunks("$GNRMC,1*a\r\n"))),
      scheduleFlush: synchronousFlush,
    });

    await store.connect();
    expect(store.getStatus()).toBe("connected");

    await store.disconnect();
    expect(store.getStatus()).toBe("idle");
  });

  it("turns received chunks into log entries", async () => {
    const store = new SerialMonitorStore({
      serial: createFakeSerial(createFakePort(encodeChunks("$GNRMC,1*a\r\n$GNGGA,2*b\r\n"))),
      scheduleFlush: synchronousFlush,
    });

    await store.connect();
    await tick();
    await tick();

    expect(store.getLogEntries().map((entry) => entry.sentence)).toEqual([
      "$GNRMC,1*a",
      "$GNGGA,2*b",
    ]);

    await store.disconnect();
  });

  it("reassembles a sentence split across two chunks", async () => {
    const store = new SerialMonitorStore({
      serial: createFakeSerial(createFakePort(encodeChunks("$GNR", "MC,1*a\r\n"))),
      scheduleFlush: synchronousFlush,
    });

    await store.connect();
    await tick();
    await tick();

    expect(store.getLogEntries().map((entry) => entry.sentence)).toEqual(["$GNRMC,1*a"]);

    await store.disconnect();
  });

  it("flushes every batch when chunks arrive separately (synchronous scheduler)", async () => {
    const store = new SerialMonitorStore({
      serial: createFakeSerial(createFakePort(encodeChunks("$GNRMC,1*a\r\n", "$GNGGA,2*b\r\n"))),
      scheduleFlush: synchronousFlush,
    });

    await store.connect();
    await tick();
    await tick();

    // Each chunk enqueues separately; the second batch must not be stranded.
    expect(store.getLogEntries().map((entry) => entry.sentence)).toEqual([
      "$GNRMC,1*a",
      "$GNGGA,2*b",
    ]);

    await store.disconnect();
  });

  it("clears the log", async () => {
    const store = new SerialMonitorStore({
      serial: createFakeSerial(createFakePort(encodeChunks("$GNRMC,1*a\r\n"))),
      scheduleFlush: synchronousFlush,
    });

    await store.connect();
    await tick();
    expect(store.getLogEntries()).toHaveLength(1);

    store.clearLog();
    expect(store.getLogEntries()).toEqual([]);

    await store.disconnect();
  });

  it("notifies subscribers on status changes", async () => {
    const store = new SerialMonitorStore({
      serial: createFakeSerial(createFakePort([])),
      scheduleFlush: synchronousFlush,
    });

    let notifications = 0;
    const unsubscribe = store.subscribe(() => {
      notifications += 1;
    });

    await store.connect();
    expect(notifications).toBeGreaterThan(0);

    unsubscribe();
    const before = notifications;
    await store.disconnect();
    expect(notifications).toBe(before);
  });

  it("reports an error when no port is selected", async () => {
    const serial = {
      requestPort: async () => {
        throw new DOMException("no port", "NotFoundError");
      },
    } as unknown as Serial;
    const store = new SerialMonitorStore({ serial, scheduleFlush: synchronousFlush });

    await store.connect();

    expect(store.getStatus()).toBe("idle");
    expect(store.getErrorMessage()).toBe("ポートが選択されませんでした。");
  });

  it("defaults the baud rate and persists changes across instances", () => {
    const storage = createMemoryStorage();
    const serial = createFakeSerial(createFakePort([]));

    const first = new SerialMonitorStore({ serial, storage });
    expect(first.getBaudRate()).toBe(defaultBaudRate);

    first.setBaudRate(9600);
    expect(first.getBaudRate()).toBe(9600);

    const second = new SerialMonitorStore({ serial, storage });
    expect(second.getBaudRate()).toBe(9600);
  });

  it("ignores an invalid stored baud rate", () => {
    const storage = createMemoryStorage();
    storage.setItem("web-serial-monitor:baud-rate", "12345");

    const store = new SerialMonitorStore({ serial: createFakeSerial(createFakePort([])), storage });
    expect(store.getBaudRate()).toBe(defaultBaudRate);
  });
});
