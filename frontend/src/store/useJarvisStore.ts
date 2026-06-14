"use client";

import { create } from "zustand";
import { titleFromMessages } from "@/lib/utils";
import type { Message, RegistryEntry, RunStatus, StepEvent, Thread } from "@/types/jarvis";

interface JarvisState {
  connectionError: string | null;
  sidebarCollapsed: boolean;
  threads: {
    list: Thread[];
    activeId: string | null;
    isLoading: boolean;
  };
  messages: {
    byThreadId: Record<string, Message[]>;
  };
  runState: {
    runId: string | null;
    status: RunStatus;
    steps: StepEvent[];
    isStreaming: boolean;
    elapsedMs: number;
    startedAt: number | null;
    pinned: boolean;
    panelOpen: boolean;
  };
  registry: {
    tools: RegistryEntry[];
    agents: RegistryEntry[];
    drawerOpen: boolean;
    isLoading: boolean;
  };
  setConnectionError: (error: string | null) => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  setThreads: (threads: Thread[]) => void;
  setThreadsLoading: (loading: boolean) => void;
  upsertThread: (thread: Thread) => void;
  removeThread: (threadId: string) => void;
  renameThread: (threadId: string, title: string) => void;
  setActiveThread: (threadId: string | null) => void;
  setMessages: (threadId: string, messages: Message[]) => void;
  appendMessage: (threadId: string, message: Message) => void;
  updateMessage: (threadId: string, messageId: string, patch: Partial<Message>) => void;
  truncateMessagesAfter: (threadId: string, messageId: string) => void;
  startRun: (runId?: string | null) => void;
  setRunId: (runId: string | null) => void;
  finishRun: (status: Exclude<RunStatus, "idle" | "running">) => void;
  resetRun: () => void;
  addStep: (step: StepEvent) => void;
  setElapsedMs: (elapsedMs: number) => void;
  setPanelOpen: (open: boolean) => void;
  setPinned: (pinned: boolean) => void;
  setRegistry: (entries: RegistryEntry[]) => void;
  setRegistryLoading: (loading: boolean) => void;
  updateRegistryEntry: (name: string, active: boolean) => void;
}

export const useJarvisStore = create<JarvisState>((set) => ({
  connectionError: null,
  sidebarCollapsed: false,
  threads: { list: [], activeId: null, isLoading: false },
  messages: { byThreadId: {} },
  runState: {
    runId: null,
    status: "idle",
    steps: [],
    isStreaming: false,
    elapsedMs: 0,
    startedAt: null,
    pinned: false,
    panelOpen: false
  },
  registry: { tools: [], agents: [], drawerOpen: false, isLoading: false },
  setConnectionError: (connectionError) => set({ connectionError }),
  setSidebarCollapsed: (sidebarCollapsed) => set({ sidebarCollapsed }),
  setThreads: (list) =>
    set((state) => ({
      threads: {
        ...state.threads,
        list: list.map((thread) => {
          const existing = state.threads.list.find((item) => item.id === thread.id);
          const preserveExistingTitle = existing && (!thread.title || thread.title === "New conversation");
          return preserveExistingTitle ? { ...thread, title: existing.title } : thread;
        })
      }
    })),
  setThreadsLoading: (isLoading) => set((state) => ({ threads: { ...state.threads, isLoading } })),
  upsertThread: (thread) =>
    set((state) => {
      const exists = state.threads.list.some((item) => item.id === thread.id);
      return {
        threads: {
          ...state.threads,
          list: exists
            ? state.threads.list.map((item) =>
                item.id === thread.id ? { ...item, ...thread, title: thread.title ?? item.title } : item
              )
            : [thread, ...state.threads.list]
        }
      };
    }),
  removeThread: (threadId) =>
    set((state) => ({
      threads: {
        ...state.threads,
        list: state.threads.list.filter((thread) => thread.id !== threadId)
      }
    })),
  renameThread: (threadId, title) =>
    set((state) => ({
      threads: {
        ...state.threads,
        list: state.threads.list.map((thread) =>
          thread.id === threadId ? { ...thread, title } : thread
        )
      }
    })),
  setActiveThread: (activeId) => set((state) => ({ threads: { ...state.threads, activeId } })),
  setMessages: (threadId, messages) =>
    set((state) => {
      const existingThread = state.threads.list.find((thread) => thread.id === threadId);
      const title = existingThread?.title || titleFromMessages(messages);
      return {
        messages: {
          byThreadId: {
            ...state.messages.byThreadId,
            [threadId]: messages
          }
        },
        threads:
          existingThread && (!existingThread.title || existingThread.title === "New conversation") && title
            ? {
                ...state.threads,
                list: state.threads.list.map((thread) =>
                  thread.id === threadId ? { ...thread, title } : thread
                )
              }
            : state.threads
      };
    }),
  appendMessage: (threadId, message) =>
    set((state) => {
      const current = state.messages.byThreadId[threadId] ?? [];
      const nextMessages = [...current, message];
      const existingThread = state.threads.list.find((thread) => thread.id === threadId);
      const title = existingThread?.title || titleFromMessages(nextMessages);
      return {
        messages: {
          byThreadId: {
            ...state.messages.byThreadId,
            [threadId]: nextMessages
          }
        },
        threads:
          existingThread && (!existingThread.title || existingThread.title === "New conversation") && title
            ? {
                ...state.threads,
                list: state.threads.list.map((thread) =>
                  thread.id === threadId ? { ...thread, title } : thread
                )
              }
            : state.threads
      };
    }),
  updateMessage: (threadId, messageId, patch) =>
    set((state) => ({
      messages: {
        byThreadId: {
          ...state.messages.byThreadId,
          [threadId]: (state.messages.byThreadId[threadId] ?? []).map((message) =>
            message.id === messageId ? { ...message, ...patch } : message
          )
        }
      }
    })),
  truncateMessagesAfter: (threadId, messageId) =>
    set((state) => {
      const messages = state.messages.byThreadId[threadId] ?? [];
      const index = messages.findIndex((message) => message.id === messageId);
      return {
        messages: {
          byThreadId: {
            ...state.messages.byThreadId,
            [threadId]: index >= 0 ? messages.slice(0, index + 1) : messages
          }
        }
      };
    }),
  startRun: (runId = null) =>
    set({
      runState: {
        runId,
        status: "running",
        steps: [],
        isStreaming: true,
        elapsedMs: 0,
        startedAt: Date.now(),
        pinned: false,
        panelOpen: true
      }
    }),
  setRunId: (runId) => set((state) => ({ runState: { ...state.runState, runId } })),
  finishRun: (status) =>
    set((state) => ({
      runState: {
        ...state.runState,
        status,
        isStreaming: false,
        elapsedMs: state.runState.startedAt ? Date.now() - state.runState.startedAt : state.runState.elapsedMs,
        panelOpen: state.runState.pinned
      }
    })),
  resetRun: () =>
    set((state) => ({
      runState: { ...state.runState, runId: null, status: "idle", isStreaming: false, steps: [], elapsedMs: 0, startedAt: null }
    })),
  addStep: (step) => set((state) => ({ runState: { ...state.runState, steps: [...state.runState.steps, step] } })),
  setElapsedMs: (elapsedMs) => set((state) => ({ runState: { ...state.runState, elapsedMs } })),
  setPanelOpen: (panelOpen) => set((state) => ({ runState: { ...state.runState, panelOpen } })),
  setPinned: (pinned) => set((state) => ({ runState: { ...state.runState, pinned, panelOpen: pinned || state.runState.panelOpen } })),
  setRegistry: (entries) =>
    set((state) => ({
      registry: {
        ...state.registry,
        tools: entries.filter((entry) => entry.type === "tool"),
        agents: entries.filter((entry) => entry.type === "agent")
      }
    })),
  setRegistryLoading: (isLoading) => set((state) => ({ registry: { ...state.registry, isLoading } })),
  updateRegistryEntry: (name, active) =>
    set((state) => ({
      registry: {
        ...state.registry,
        tools: state.registry.tools.map((entry) => (entry.name === name ? { ...entry, active } : entry)),
        agents: state.registry.agents.map((entry) => (entry.name === name ? { ...entry, active } : entry))
      }
    }))
}));
