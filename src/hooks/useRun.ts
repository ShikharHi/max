"use client";

import { useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import {
  compactId,
  invocationsToToolCalls,
  isRecord,
  messagesFromThreadValues,
  nodeUpdatesToSteps,
  partialAnswerFromJson,
  statusTextFromUpdate
} from "@/lib/utils";
import { useJarvisStore } from "@/store/useJarvisStore";
import type { Invocation, Message, ThreadValues } from "@/types/jarvis";
import { useSSEStream } from "./useSSEStream";

export function useRun() {
  const { consume, cancel: cancelStream } = useSSEStream();
  const abortRef = useRef<AbortController | null>(null);
  const tokenBufferRef = useRef("");
  const runStartedAtRef = useRef<number>(Date.now());
  const activeAssistantIdRef = useRef<string | null>(null);

  const activeThreadId = useJarvisStore((state) => state.threads.activeId);
  const runState = useJarvisStore((state) => state.runState);
  const createThreadInStore = useJarvisStore((state) => state.upsertThread);
  const setActiveThread = useJarvisStore((state) => state.setActiveThread);
  const setMessages = useJarvisStore((state) => state.setMessages);
  const appendMessage = useJarvisStore((state) => state.appendMessage);
  const updateMessage = useJarvisStore((state) => state.updateMessage);
  const startRunState = useJarvisStore((state) => state.startRun);
  const setRunId = useJarvisStore((state) => state.setRunId);
  const setRunStatus = useJarvisStore((state) => state.setRunStatus);
  const addSteps = useJarvisStore((state) => state.addSteps);
  const setRunElapsed = useJarvisStore((state) => state.setRunElapsed);
  const setStatusText = useJarvisStore((state) => state.setStatusText);
  const setAssistantToolCalls = useJarvisStore((state) => state.setAssistantToolCalls);
  const updateAssistantToolResults = useJarvisStore((state) => state.updateAssistantToolResults);
  const finalizeToolCalls = useJarvisStore((state) => state.finalizeToolCalls);
  const replaceUserMessageAndTruncate = useJarvisStore((state) => state.replaceUserMessageAndTruncate);
  const truncateAfterMessage = useJarvisStore((state) => state.truncateAfterMessage);

  useEffect(() => {
    if (runState.status !== "running" || !runState.startedAt) {
      return;
    }

    const interval = window.setInterval(() => {
      setRunElapsed(Date.now() - runState.startedAt!);
    }, 100);

    return () => window.clearInterval(interval);
  }, [runState.startedAt, runState.status, setRunElapsed]);

  const router = useRouter();

  const runOnThread = useCallback(
    async (threadId: string, content: string, appendUser = true) => {
      const clean = content.trim();
      if (!clean) {
        return;
      }

      const now = new Date().toISOString();
      const assistantMessage: Message = {
        id: compactId("assistant"),
        threadId,
        role: "assistant",
        content: "",
        createdAt: now,
        status: "thinking",
        toolCalls: []
      };

      activeAssistantIdRef.current = assistantMessage.id;
      tokenBufferRef.current = "";
      runStartedAtRef.current = Date.now();
      startRunState();

      if (appendUser) {
        appendMessage(threadId, {
          id: compactId("user"),
          threadId,
          role: "user",
          content: clean,
          createdAt: now,
          status: "complete"
        });
      }

      appendMessage(threadId, assistantMessage);

      const abortController = new AbortController();
      abortRef.current = abortController;

      try {
        const { body, runId } = await api.streamRun(threadId, clean, abortController.signal);
        if (runId) {
          setRunId(runId);
        }

        await consume(body, {
          onMetadata: (metadata) => {
            if (metadata.run_id) {
              setRunId(metadata.run_id);
            }
          },
          onUpdates: (update) => {
            const steps = nodeUpdatesToSteps(update, runStartedAtRef.current);
            addSteps(steps);
            setStatusText(statusTextFromUpdate(update));

            if (isRecord(update) && isRecord(update.router)) {
              const invocations = Array.isArray(update.router.invocations) ? update.router.invocations : [];
              if (invocations.length && activeAssistantIdRef.current) {
                setAssistantToolCalls(
                  threadId,
                  activeAssistantIdRef.current,
                  invocationsToToolCalls(invocations as Invocation[])
                );
              }
            }

            if (isRecord(update) && isRecord(update.executor)) {
              const results = Array.isArray(update.executor.execution_results)
                ? update.executor.execution_results.filter((value): value is string => typeof value === "string")
                : [];
              if (activeAssistantIdRef.current) {
                updateAssistantToolResults(threadId, activeAssistantIdRef.current, results);
              }
            }
          },
          onValues: (values: ThreadValues) => {
            const finalAnswer = typeof values.final_answer === "string" ? values.final_answer : "";
            if (finalAnswer && activeAssistantIdRef.current) {
              updateMessage(threadId, activeAssistantIdRef.current, {
                content: finalAnswer,
                status: "streaming"
              });
            }
          },
          onToken: (token: unknown) => {
            let content = "";
            if (typeof token === "object" && token !== null && "content" in token) {
              const obj = token as Record<string, unknown>;
              content = String(obj.content ?? "");
            }
            if (!content || !activeAssistantIdRef.current) {
              return;
            }

            tokenBufferRef.current += content;
            const answer = partialAnswerFromJson(tokenBufferRef.current);
            if (answer) {
              updateMessage(threadId, activeAssistantIdRef.current, {
                content: answer,
                status: "streaming"
              });
            }
          },
          onError: (error) => {
            const message = error.error ?? "Run failed";
            if (activeAssistantIdRef.current) {
              updateMessage(threadId, activeAssistantIdRef.current, {
                content: message,
                status: "error"
              });
            }
            setRunStatus("error", message);
          },
          onEnd: async () => {
            if (activeAssistantIdRef.current) {
              finalizeToolCalls(threadId, activeAssistantIdRef.current);
              updateMessage(threadId, activeAssistantIdRef.current, {
                status: "complete"
              });
            }
            setRunElapsed(Date.now() - runStartedAtRef.current);
            setRunStatus("done");

            try {
              const state = await api.getThreadState(threadId);
              const restored = messagesFromThreadValues(threadId, state.values);
              if (restored.length) {
                setMessages(threadId, restored);
              }
            } catch {
              // The optimistic stream already contains the useful result.
            }
          }
        });
      } catch (error) {
        if (abortController.signal.aborted) {
          return;
        }

        const message = error instanceof ApiError ? error.message : "Could not start the run";
        if (activeAssistantIdRef.current) {
          updateMessage(threadId, activeAssistantIdRef.current, {
            content: message,
            status: "error"
          });
        }
        setRunStatus("error", message);
      } finally {
        abortRef.current = null;
      }
    },
    [
      addSteps,
      appendMessage,
      consume,
      finalizeToolCalls,
      setAssistantToolCalls,
      setMessages,
      setRunElapsed,
      setRunId,
      setRunStatus,
      setStatusText,
      startRunState,
      updateAssistantToolResults,
      updateMessage
    ]
  );

  const sendMessage = useCallback(
    async (content: string) => {
      let threadId = activeThreadId;
      if (!threadId) {
        const thread = await api.createThread();
        console.debug("useRun: created backend thread", thread.thread_id);
        createThreadInStore(thread);
        setActiveThread(thread.thread_id);
        setMessages(thread.thread_id, []);
        threadId = thread.thread_id;
        // Update URL to use the canonical backend thread id
        try {
          router.replace(`/c/${thread.thread_id}`);
          console.debug("useRun: router.replace called for /c/" + thread.thread_id);
        } catch {
          if (typeof window !== "undefined") {
            try {
              window.history.replaceState(null, "", `/c/${thread.thread_id}`);
              console.debug("useRun: window.history.replaceState set to /c/" + thread.thread_id);
            } catch {}
          }
        }
        // If URL still hasn't updated, force a full navigation as a last resort
        if (typeof window !== "undefined") {
          try {
            if (!window.location.pathname.startsWith(`/c/`)) {
              console.debug("useRun: forcing full navigation to /c/" + thread.thread_id);
              window.location.replace(`/c/${thread.thread_id}`);
            }
          } catch {
            /* ignore */
          }
        }
          // If URL still hasn't updated, force a full navigation as a last resort
          if (typeof window !== "undefined") {
            try {
              if (!window.location.pathname.startsWith(`/c/`)) {
                console.debug("useRun: forcing full navigation to /c/" + thread.thread_id);
                window.location.replace(`/c/${thread.thread_id}`);
              }
            } catch {
              /* ignore */
            }
          }
      } else {
        // Check if this is a pending thread (not yet created on the backend)
        const threadExists = useJarvisStore.getState().threads.list.some((t) => t.thread_id === threadId);
        if (!threadExists) {
          // Create the pending thread on the backend
          const thread = await api.createThread();
          console.debug("useRun: created backend thread (pending) ", thread.thread_id);
          createThreadInStore(thread);
          // The thread ID should be the same (both are UUIDs), but update just to be safe
          threadId = thread.thread_id;
          // Update URL to the canonical backend thread id
          try {
            router.replace(`/c/${thread.thread_id}`);
          } catch {
            if (typeof window !== "undefined") {
              try {
                window.history.replaceState(null, "", `/c/${thread.thread_id}`);
              } catch {}
            }
          }
        }
      }

      // Persist auto-generated title from the message only for empty/default titles
      const { titleFromMessage } = await import("@/lib/utils");
      const currentThread = useJarvisStore.getState().threads.list.find((thread) => thread.thread_id === threadId);
      const currentTitle = currentThread?.title;
      const generatedTitle = titleFromMessage(content);
      const shouldUpdateTitle = !currentTitle || currentTitle === "New conversation" || !currentTitle.trim();
      if (generatedTitle && shouldUpdateTitle) {
        api.updateThreadMetadata(threadId, { title: generatedTitle }).catch(() => {
          // Silently fail - title is already set locally
        });
      }

      await runOnThread(threadId, content, true);
    },
    [activeThreadId, createThreadInStore, runOnThread, setActiveThread, setMessages]
  );

  const regenerateFromMessage = useCallback(
    async (threadId: string, assistantMessageId: string) => {
      const messages = useJarvisStore.getState().messages.byThreadId[threadId] ?? [];
      const index = messages.findIndex((message) => message.id === assistantMessageId);
      const previousUser = messages
        .slice(0, index === -1 ? messages.length : index)
        .reverse()
        .find((message) => message.role === "user");

      if (!previousUser) {
        return;
      }

      truncateAfterMessage(threadId, previousUser.id);
      await runOnThread(threadId, previousUser.content, false);
    },
    [runOnThread, truncateAfterMessage]
  );

  const editAndRerun = useCallback(
    async (threadId: string, userMessageId: string, content: string) => {
      const next = replaceUserMessageAndTruncate(threadId, userMessageId, content);
      if (!next) {
        return;
      }

      await runOnThread(threadId, content, false);
    },
    [replaceUserMessageAndTruncate, runOnThread]
  );

  const stopRun = useCallback(async () => {
    const threadId = useJarvisStore.getState().threads.activeId;
    const runId = useJarvisStore.getState().runState.runId;
    abortRef.current?.abort();
    await cancelStream();

    if (threadId && runId) {
      await api.cancelRun(threadId, runId).catch(() => undefined);
    }

    if (activeAssistantIdRef.current && threadId) {
      updateMessage(threadId, activeAssistantIdRef.current, {
        status: "error",
        content: "Run was cancelled."
      });
    }

    setRunStatus("error", "Run was cancelled.");
  }, [cancelStream, setRunStatus, updateMessage]);

  return {
    runState,
    sendMessage,
    regenerateFromMessage,
    editAndRerun,
    stopRun
  };
}
