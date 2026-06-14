"use client";

import { useCallback, useEffect, useRef } from "react";
import type { StreamCallbacks } from "@/types/jarvis";
import { extractToken } from "@/lib/utils";

function parseData(raw: string) {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

export function useSSEStream() {
  const readerRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null);

  const cancel = useCallback(() => {
    void readerRef.current?.cancel().catch(() => undefined);
    readerRef.current = null;
  }, []);

  const consume = useCallback(
    async (stream: ReadableStream<Uint8Array>, callbacks: StreamCallbacks) => {
      cancel();
      const reader = stream.getReader();
      readerRef.current = reader;
      const decoder = new TextDecoder();
      let buffer = "";
      let currentEvent = "message";
      let dataLines: string[] = [];
      let ended = false;

      const emit = () => {
        if (!dataLines.length) return;
        const data = parseData(dataLines.join("\n"));
        switch (currentEvent) {
          case "metadata":
            callbacks.onMetadata?.(data);
            break;
          case "updates":
            callbacks.onUpdates?.(data);
            break;
          case "values":
            callbacks.onValues?.(data);
            break;
          case "messages/partial":
            const token = extractToken(data);
            if (token) callbacks.onToken?.(token, data);
            break;
          case "error":
            callbacks.onError?.(data);
            break;
          case "end":
            ended = true;
            callbacks.onEnd?.();
            break;
          default:
            if (currentEvent.includes("partial")) callbacks.onToken?.(extractToken(data), data);
            break;
        }
        currentEvent = "message";
        dataLines = [];
      };

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split(/\r?\n/);
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (!line.trim()) {
              emit();
              continue;
            }
            if (line.startsWith("event:")) currentEvent = line.slice(6).trim();
            if (line.startsWith("data:")) dataLines.push(line.slice(5).trimStart());
          }
        }
        if (buffer.trim()) {
          if (buffer.startsWith("data:")) dataLines.push(buffer.slice(5).trimStart());
          emit();
        }
        if (!ended) callbacks.onEnd?.();
      } catch (error) {
        callbacks.onError?.(error);
      } finally {
        readerRef.current = null;
      }
    },
    [cancel]
  );

  // Don't cancel active streams automatically on component unmount.
  // New-chat navigation can unmount the current InputBar while a run
  // is still streaming; we want the run to continue and update the store.
  useEffect(() => {
    return () => {
      // Intentionally no cleanup.
    };
  }, []);

  return { consume, cancel };
}
