import { describe, expect, it } from "vite-plus/test";

import { createLineBuffer } from "@/lib/nmea-line-buffer";

describe("createLineBuffer", () => {
  it("emits a sentence only after a line ending arrives", () => {
    const buffer = createLineBuffer(8192);

    expect(buffer.push("$GNRMC,123").lines).toEqual([]);
    expect(buffer.pending).toBe("$GNRMC,123");

    const result = buffer.push("519*hh\r\n");
    expect(result.lines).toEqual(["$GNRMC,123519*hh"]);
    expect(buffer.pending).toBe("");
  });

  it("splits multiple complete sentences in a single chunk", () => {
    const buffer = createLineBuffer(8192);

    const result = buffer.push("$GNGGA,1*a\r\n$GNRMC,2*b\r\n");
    expect(result.lines).toEqual(["$GNGGA,1*a", "$GNRMC,2*b"]);
  });

  it("handles bare LF and CRLF line endings", () => {
    const buffer = createLineBuffer(8192);

    const result = buffer.push("lf-line\ncrlf-line\r\n");
    expect(result.lines).toEqual(["lf-line", "crlf-line"]);
  });

  it("keeps the trailing fragment buffered across chunk boundaries", () => {
    const buffer = createLineBuffer(8192);

    expect(buffer.push("$GNGGA,1*a\r\n$GNR").lines).toEqual(["$GNGGA,1*a"]);
    expect(buffer.pending).toBe("$GNR");
    expect(buffer.push("MC,2*b\r\n").lines).toEqual(["$GNRMC,2*b"]);
  });

  it("drops empty lines produced by consecutive line endings", () => {
    const buffer = createLineBuffer(8192);

    const result = buffer.push("a\r\n\r\n\r\nb\r\n");
    expect(result.lines).toEqual(["a", "b"]);
  });

  it("does not report overflow during normal operation", () => {
    const buffer = createLineBuffer(8192);

    expect(buffer.push("$GNRMC,1*a\r\n").overflowed).toBe(false);
  });

  it("flags overflow and truncates when no line ending appears", () => {
    const buffer = createLineBuffer(16);

    const result = buffer.push("0123456789abcdefghij");
    expect(result.overflowed).toBe(true);
    expect(result.lines).toEqual([]);
    expect(buffer.pending.length).toBe(16);
    expect(buffer.pending).toBe("456789abcdefghij");
  });

  it("keeps complete sentences even when one chunk exceeds the limit", () => {
    const buffer = createLineBuffer(16);

    const result = buffer.push("$GNGGA,1*a\r\n$GNRMC,2*b\r\n$GNGSA,3*c\r\n");
    expect(result.overflowed).toBe(false);
    expect(result.lines).toEqual(["$GNGGA,1*a", "$GNRMC,2*b", "$GNGSA,3*c"]);
  });

  it("recovers and emits the next complete sentence after an overflow", () => {
    const buffer = createLineBuffer(16);

    expect(buffer.push("0123456789abcdefghij").overflowed).toBe(true);
    const result = buffer.push("\n$GNRMC,2*b\r\n");
    expect(result.overflowed).toBe(false);
    expect(result.lines).toEqual(["456789abcdefghij", "$GNRMC,2*b"]);
  });

  it("clears the pending fragment on reset", () => {
    const buffer = createLineBuffer(8192);

    buffer.push("$GNR");
    buffer.reset();
    expect(buffer.pending).toBe("");
    expect(buffer.push("MC,2*b\r\n").lines).toEqual(["MC,2*b"]);
  });
});
