"use client";

import { useCallback, useEffect, useRef } from "react";
import type { SSECallbacks, ThreadValues } from "@/types/jarvis";

type StreamEvent = {
  event: string;
  data: unknown;
};

export function useSSEStream() {
  const readerRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null);
  const cancelledRef = useRef(false);

  const cancel = useCallback(async () => {
    cancelledRef.current = true;
    const reader = readerRef.current;
    readerRef.current = null;
    if (reader) {
      await reader.cancel().catch(() => undefined);
    }
  }, []);

  const consume = useCallback(
    async (stream: ReadableStream<Uint8Array>, callbacks: SSECallbacks) => {
      await cancel();
      cancelledRef.current = false;

      const decoder = new TextDecoder();
      const reader = stream.getReader();
      readerRef.current = reader;
      let buffer = "";

      try {
        while (!cancelledRef.current) {
          const { value, done } = await reader.read();
          if (done) {
            break;
          }

          buffer += decoder.decode(value, { stream: true });
          buffer = buffer.replace(/\r\n/g, "\n");

          let boundaryIndex = buffer.indexOf("\n\n");
          while (boundaryIndex !== -1) {
            const rawEvent = buffer.slice(0, boundaryIndex);
            buffer = buffer.slice(boundaryIndex + 2);
            dispatchEvent(parseEvent(rawEvent), callbacks);
            boundaryIndex = buffer.indexOf("\n\n");
          }
        }

        if (buffer.trim()) {
          dispatchEvent(parseEvent(buffer), callbacks);
        }
      } finally {
        reader.releaseLock();
        if (readerRef.current === reader) {
          readerRef.current = null;
        }
      }
    },
    [cancel]
  );

  useEffect(() => {
    return () => {
      void cancel();
    };
  }, [cancel]);

  return { consume, cancel };
}

function parseEvent(raw: string): StreamEvent {
  let event = "message";
  const dataLines: string[] = [];

  for (const line of raw.split("\n")) {
    if (!line || line.startsWith(":")) {
      continue;
    }

    if (line.startsWith("event:")) {
      event = line.slice(6).trim();
      continue;
    }

    if (line.startsWith("data:")) {
      dataLines.push(line.slice(5).trimStart());
    }
  }

  const rawData = dataLines.join("\n");
  let data: unknown = rawData;
  if (rawData) {
    try {
      data = JSON.parse(rawData);
    } catch {
      data = rawData;
    }
  } else {
    data = {};
  }

  return { event, data };
}

function dispatchEvent(streamEvent: StreamEvent, callbacks: SSECallbacks) {
  switch (streamEvent.event) {
    case "metadata":
      callbacks.onMetadata?.(streamEvent.data as { run_id?: string; thread_id?: string | null });
      break;
    case "updates":
      callbacks.onUpdates?.(streamEvent.data);
      break;
    case "values":
      callbacks.onValues?.(streamEvent.data as ThreadValues);
      break;
    case "messages/partial":
      callbacks.onToken?.(
        streamEvent.data as { content?: string; type?: string; metadata?: Record<string, unknown> }
      );
      break;
    case "error":
      callbacks.onError?.(streamEvent.data as { error?: string; run_id?: string });
      break;
    case "end":
      callbacks.onEnd?.();
      break;
    default:
      break;
  }
}
