export type LineBufferPushResult = {
  /** Complete NMEA Sentences extracted from the buffered text. */
  lines: string[];
  /**
   * True when the pending text exceeded the configured limit and was
   * truncated. Signals that the incoming data likely never contains a line
   * ending (e.g. a Baud Rate mismatch).
   */
  overflowed: boolean;
};

export type LineBuffer = {
  /** Append a Receive Chunk and return any newly completed NMEA Sentences. */
  push(chunk: string): LineBufferPushResult;
  /** Discard any buffered partial text. */
  reset(): void;
  /** The buffered text that has not yet been terminated by a line ending. */
  readonly pending: string;
};

/**
 * Buffers decoded serial text and splits it into complete NMEA Sentences.
 *
 * A NMEA Sentence is only emitted once a line ending (CRLF or LF) is received,
 * so a Receive Chunk that ends mid-line keeps its trailing fragment buffered
 * until the rest arrives. Empty lines are dropped.
 */
export function createLineBuffer(maxPendingLength: number): LineBuffer {
  let pending = "";

  return {
    push(chunk: string): LineBufferPushResult {
      pending += chunk;

      const parts = pending.split(/\r?\n/);
      pending = parts.pop() ?? "";
      const lines = parts.map((line) => line.replace(/\r$/, "")).filter(Boolean);

      // Only the unterminated trailing fragment is bounded. Complete sentences
      // are always emitted, even when a single chunk carries more than the
      // limit, so a large burst never loses already-terminated lines.
      let overflowed = false;
      if (pending.length > maxPendingLength) {
        pending = pending.slice(-maxPendingLength);
        overflowed = true;
      }

      return { lines, overflowed };
    },
    reset() {
      pending = "";
    },
    get pending() {
      return pending;
    },
  };
}
