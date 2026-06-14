"use client";

import { useCallback, useEffect } from "react";
import { api } from "@/lib/api";
import { extractMessagesFromValues, isAssistantMessageRecord, isUserMessageRecord, uid } from "@/lib/utils";
import { useJarvisStore } from "@/store/useJarvisStore";
import type { Message } from "@/types/jarvis";

function messagesFromState(state: unknown): Message[] {
  const values = (state as Record<string, unknown>)?.values as Record<string, unknown> | undefined;
  const valueMessages = extractMessagesFromValues(values);
  const rows = valueMessages.length ? valueMessages : ((state as Record<string, unknown>)?.messages as unknown);
  if (!Array.isArray(rows)) return [];
  return rows
    .map((row) => {
      const record = row as Record<string, unknown>;
      const role: "user" | "assistant" = isUserMessageRecord(record) ? "user" : "assistant";
      const content = record.content ?? record.text;
      return {
        id: String(record.id ?? uid("msg")),
        role,
        content: typeof content === "string" ? content : "",
        createdAt: typeof record.createdAt === "string" ? record.createdAt : new Date().toISOString(),
        status: "done" as const
      };
    })
    .filter((message, index, list) => {
      if (!message.content) return false;
      if (message.role === "assistant") return true;
      return isUserMessageRecord(rows[index] as Record<string, unknown>) || isAssistantMessageRecord(rows[index] as Record<string, unknown>);
    });
}

export function useThreads(autoLoad = false) {
  const {
    setConnectionError,
    setThreads,
    setThreadsLoading,
    upsertThread,
    setActiveThread,
    setMessages,
    removeThread,
    renameThread: renameThreadLocal
  } = useJarvisStore();

  const loadThreads = useCallback(async () => {
    setThreadsLoading(true);
    try {
      const threads = await api.getThreads();
      setThreads(threads);
      setConnectionError(null);
    } catch {
      setConnectionError(`Cannot connect to JARVIS at ${api.baseUrl.replace(/^https?:\/\//, "")} - check your server`);
    } finally {
      setThreadsLoading(false);
    }
  }, [setConnectionError, setThreads, setThreadsLoading]);

  const createThread = useCallback(async () => {
    try {
      const thread = await api.createThread();
      upsertThread(thread);
      setActiveThread(thread.id);
      setMessages(thread.id, []);
      setConnectionError(null);
      return thread.id;
    } catch {
      const localId = uid("thread");
      upsertThread({ id: localId, title: "New conversation", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), status: "idle" });
      setActiveThread(localId);
      setMessages(localId, []);
      setConnectionError(`Cannot connect to JARVIS at ${api.baseUrl.replace(/^https?:\/\//, "")} - check your server`);
      return localId;
    }
  }, [setActiveThread, setConnectionError, setMessages, upsertThread]);

  const deleteThread = useCallback(
    async (threadId: string) => {
      try {
        await api.deleteThread(threadId);
      } catch {
        // ignore backend failure and still remove locally
      }
      removeThread(threadId);
    },
    [removeThread]
  );

  const renameThread = useCallback(
    async (threadId: string, title: string) => {
      try {
        const thread = await api.updateThreadMetadata(threadId, { title });
        upsertThread(thread);
      } catch {
        renameThreadLocal(threadId, title);
      }
    },
    [renameThreadLocal, upsertThread]
  );

  const selectThread = useCallback(
    async (threadId: string) => {
      const currentState = useJarvisStore.getState();
      const currentMessages = currentState.messages.byThreadId[threadId] ?? [];

      // If the requested thread is already active and already has local messages,
      // do not overwrite them with backend state while a run is still in progress.
      if (currentState.threads.activeId === threadId && currentMessages.length > 0) {
        setActiveThread(threadId);
        return;
      }

      setActiveThread(threadId);
      try {
        const state = await api.getThreadState(threadId);
        const messages = messagesFromState(state);
        setMessages(threadId, messages);
        
        // Persist auto-generated titles back to the backend
        const thread = useJarvisStore.getState().threads.list.find((t) => t.id === threadId);
        if (thread && (!thread.title || thread.title === "New conversation") && messages.length > 0) {
          const { titleFromMessages } = await import("@/lib/utils");
          const generatedTitle = titleFromMessages(messages);
          if (generatedTitle && generatedTitle !== "New conversation") {
            try {
              await api.updateThreadMetadata(threadId, { title: generatedTitle });
              upsertThread({ ...thread, title: generatedTitle });
            } catch {
              // Silently fail - title is already set locally
            }
          }
        }
        
        setConnectionError(null);
      } catch {
        setConnectionError(`Cannot connect to JARVIS at ${api.baseUrl.replace(/^https?:\/\//, "")} - check your server`);
      }
    },
    [setActiveThread, setConnectionError, setMessages, upsertThread]
  );

  useEffect(() => {
    if (autoLoad) void loadThreads();
  }, [autoLoad, loadThreads]);

  return { loadThreads, createThread, selectThread, deleteThread, renameThread };
}
