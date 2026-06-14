"use client";

import { useCallback, useEffect } from "react";
import { api, API_URL, ApiError } from "@/lib/api";
import { messagesFromThreadValues } from "@/lib/utils";
import { useJarvisStore } from "@/store/useJarvisStore";

export function useThreads(autoLoad = true) {
  const threads = useJarvisStore((state) => state.threads);
  const setThreads = useJarvisStore((state) => state.setThreads);
  const setThreadsLoading = useJarvisStore((state) => state.setThreadsLoading);
  const setConnectionError = useJarvisStore((state) => state.setConnectionError);
  const setActiveThread = useJarvisStore((state) => state.setActiveThread);
  const upsertThread = useJarvisStore((state) => state.upsertThread);
  const removeThread = useJarvisStore((state) => state.removeThread);
  const setMessages = useJarvisStore((state) => state.setMessages);

  const refreshThreads = useCallback(async () => {
    setThreadsLoading(true);
    try {
      await api.health();
      const nextThreads = await api.listThreads(80);
      setThreads(nextThreads);
      setConnectionError(null);
    } catch (error) {
      setThreads([]);
      setConnectionError(connectionMessage(error));
    } finally {
      setThreadsLoading(false);
    }
  }, [setConnectionError, setThreads, setThreadsLoading]);

  const createThread = useCallback(async () => {
    const thread = await api.createThread();
    upsertThread(thread);
    setActiveThread(thread.thread_id);
    setMessages(thread.thread_id, []);
    return thread;
  }, [setActiveThread, setMessages, upsertThread]);

  const createThreadPending = useCallback(() => {
    // Generate a UUID for the pending thread (matches backend format)
    // We don't upsert it to the store yet - we'll do that when the first message is sent
    const threadId = crypto.randomUUID();
    setMessages(threadId, []);
    return threadId;
  }, [setMessages]);

  const selectThread = useCallback(
    async (threadId: string) => {
      setActiveThread(threadId);
      try {
        const state = await api.getThreadState(threadId);
        const messages = messagesFromThreadValues(threadId, state.values);
        setMessages(threadId, messages);
        
        // Persist auto-generated titles back to the backend
        const thread = threads.list.find((t) => t.thread_id === threadId);
        if (thread && (!thread.title || thread.title === "New conversation") && messages.length > 0) {
          const { titleFromMessages } = await import("@/lib/utils");
          const generatedTitle = titleFromMessages(messages);
          if (generatedTitle && generatedTitle !== "New conversation") {
            try {
              await api.updateThreadMetadata(threadId, { title: generatedTitle });
              upsertThread({ ...thread, title: generatedTitle, updatedAt: new Date().toISOString() });
            } catch {
              // Silently fail - title is already set locally
            }
          }
        }
      } catch {
        const cached = threads.list.find((thread) => thread.thread_id === threadId);
        setMessages(threadId, messagesFromThreadValues(threadId, cached?.values));
      }
    },
    [setActiveThread, setMessages, threads.list, upsertThread]
  );

  const renameThread = useCallback(
    async (threadId: string, title: string) => {
      const thread = await api.updateThreadMetadata(threadId, { title });
      upsertThread(thread);
    },
    [upsertThread]
  );

  const deleteThread = useCallback(
    async (threadId: string) => {
      await api.deleteThread(threadId);
      removeThread(threadId);
    },
    [removeThread]
  );

  useEffect(() => {
    if (autoLoad) {
      void refreshThreads();
    }
  }, [autoLoad, refreshThreads]);

  return {
    threads,
    refreshThreads,
    createThread,
    createThreadPending,
    selectThread,
    renameThread,
    deleteThread
  };
}

function connectionMessage(error: unknown) {
  if (error instanceof ApiError) {
    return `Cannot connect to JARVIS at ${API_URL} - ${error.message}`;
  }
  return `Cannot connect to JARVIS at ${API_URL} - check your server`;
}
