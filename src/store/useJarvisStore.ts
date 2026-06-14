"use client";

import { create } from "zustand";
import type {
  FeedbackValue,
  Message,
  RegistryEntry,
  RunStatus,
  StepEvent,
  Thread,
  ToolCall
} from "@/types/jarvis";
import { resultName } from "@/lib/utils";

type ThreadSlice = {
  list: Thread[];
  activeId: string | null;
  isLoading: boolean;
  connectionError: string | null;
};

type MessageSlice = {
  byThreadId: Record<string, Message[]>;
};

type RunSlice = {
  runId: string | null;
  status: RunStatus;
  steps: StepEvent[];
  isStreaming: boolean;
  elapsedMs: number;
  startedAt: number | null;
  statusText: string;
  error: string | null;
};

type RegistrySlice = {
  tools: RegistryEntry[];
  agents: RegistryEntry[];
  drawerOpen: boolean;
  isLoading: boolean;
};

type UiSlice = {
  sidebarCollapsed: boolean;
  mobileSidebarOpen: boolean;
  stepsOpen: boolean;
  stepsPinned: boolean;
};

type JarvisStore = {
  threads: ThreadSlice;
  messages: MessageSlice;
  runState: RunSlice;
  registry: RegistrySlice;
  ui: UiSlice;

  setThreads: (threads: Thread[]) => void;
  setThreadsLoading: (isLoading: boolean) => void;
  setConnectionError: (error: string | null) => void;
  setActiveThread: (threadId: string | null) => void;
  upsertThread: (thread: Thread) => void;
  removeThread: (threadId: string) => void;
  renameThreadLocal: (threadId: string, title: string) => void;

  setMessages: (threadId: string, messages: Message[]) => void;
  appendMessage: (threadId: string, message: Message) => void;
  updateMessage: (threadId: string, messageId: string, patch: Partial<Message>) => void;
  replaceUserMessageAndTruncate: (threadId: string, messageId: string, content: string) => Message[] | null;
  truncateAfterMessage: (threadId: string, messageId: string) => Message[] | null;
  setFeedback: (threadId: string, messageId: string, feedback: FeedbackValue) => void;
  setAssistantToolCalls: (threadId: string, messageId: string, toolCalls: ToolCall[]) => void;
  updateAssistantToolResults: (threadId: string, messageId: string, results: string[]) => void;
  toggleToolCall: (threadId: string, messageId: string, toolCallId: string) => void;
  finalizeToolCalls: (threadId: string, messageId: string) => void;

  startRun: () => void;
  setRunId: (runId: string | null) => void;
  setRunStatus: (status: RunStatus, error?: string | null) => void;
  addSteps: (steps: StepEvent[]) => void;
  resetSteps: () => void;
  setRunElapsed: (elapsedMs: number) => void;
  setStatusText: (statusText: string) => void;

  setRegistry: (registry: { tools: RegistryEntry[]; agents: RegistryEntry[] }) => void;
  setRegistryLoading: (isLoading: boolean) => void;
  updateRegistryActive: (name: string, active: boolean) => void;
  setRegistryDrawerOpen: (open: boolean) => void;

  setSidebarCollapsed: (collapsed: boolean) => void;
  setMobileSidebarOpen: (open: boolean) => void;
  setStepsOpen: (open: boolean) => void;
  setStepsPinned: (pinned: boolean) => void;
};

const initialRunState: RunSlice = {
  runId: null,
  status: "idle",
  steps: [],
  isStreaming: false,
  elapsedMs: 0,
  startedAt: null,
  statusText: "Ready",
  error: null
};

export const useJarvisStore = create<JarvisStore>((set, get) => ({
  threads: {
    list: [],
    activeId: null,
    isLoading: false,
    connectionError: null
  },
  messages: {
    byThreadId: {}
  },
  runState: initialRunState,
  registry: {
    tools: [],
    agents: [],
    drawerOpen: false,
    isLoading: false
  },
  ui: {
    sidebarCollapsed: false,
    mobileSidebarOpen: false,
    stepsOpen: false,
    stepsPinned: false
  },

  setThreads: (threads) =>
    set((state) => ({
      threads: {
        ...state.threads,
        list: threads,
        isLoading: false
      }
    })),

  setThreadsLoading: (isLoading) =>
    set((state) => ({
      threads: {
        ...state.threads,
        isLoading
      }
    })),

  setConnectionError: (connectionError) =>
    set((state) => ({
      threads: {
        ...state.threads,
        connectionError
      }
    })),

  setActiveThread: (activeId) =>
    set((state) => ({
      threads: {
        ...state.threads,
        activeId
      }
    })),

  upsertThread: (thread) =>
    set((state) => {
      const exists = state.threads.list.some((item) => item.thread_id === thread.thread_id);
      const list = exists
        ? state.threads.list.map((item) => (item.thread_id === thread.thread_id ? thread : item))
        : [thread, ...state.threads.list];

      return {
        threads: {
          ...state.threads,
          list: list.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
        }
      };
    }),

  removeThread: (threadId) =>
    set((state) => {
      const nextMessages = { ...state.messages.byThreadId };
      delete nextMessages[threadId];

      return {
        threads: {
          ...state.threads,
          list: state.threads.list.filter((thread) => thread.thread_id !== threadId),
          activeId: state.threads.activeId === threadId ? null : state.threads.activeId
        },
        messages: {
          byThreadId: nextMessages
        }
      };
    }),

  renameThreadLocal: (threadId, title) =>
    set((state) => ({
      threads: {
        ...state.threads,
        list: state.threads.list.map((thread) =>
          thread.thread_id === threadId
            ? { ...thread, metadata: { ...thread.metadata, title }, updated_at: new Date().toISOString() }
            : thread
        )
      }
    })),

  setMessages: (threadId, messages) =>
    set((state) => ({
      messages: {
        byThreadId: {
          ...state.messages.byThreadId,
          [threadId]: messages
        }
      }
    })),

  appendMessage: (threadId, message) =>
    set((state) => ({
      messages: {
        byThreadId: {
          ...state.messages.byThreadId,
          [threadId]: [...(state.messages.byThreadId[threadId] ?? []), message]
        }
      }
    })),

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

  replaceUserMessageAndTruncate: (threadId, messageId, content) => {
    const current = get().messages.byThreadId[threadId] ?? [];
    const index = current.findIndex((message) => message.id === messageId);
    if (index === -1) {
      return null;
    }

    const next = current.slice(0, index + 1).map((message) =>
      message.id === messageId ? { ...message, content, status: "complete" as const } : message
    );

    set((state) => ({
      messages: {
        byThreadId: {
          ...state.messages.byThreadId,
          [threadId]: next
        }
      }
    }));

    return next;
  },

  truncateAfterMessage: (threadId, messageId) => {
    const current = get().messages.byThreadId[threadId] ?? [];
    const index = current.findIndex((message) => message.id === messageId);
    if (index === -1) {
      return null;
    }

    const next = current.slice(0, index + 1);
    set((state) => ({
      messages: {
        byThreadId: {
          ...state.messages.byThreadId,
          [threadId]: next
        }
      }
    }));

    return next;
  },

  setFeedback: (threadId, messageId, feedback) =>
    set((state) => ({
      messages: {
        byThreadId: {
          ...state.messages.byThreadId,
          [threadId]: (state.messages.byThreadId[threadId] ?? []).map((message) =>
            message.id === messageId ? { ...message, feedback } : message
          )
        }
      }
    })),

  setAssistantToolCalls: (threadId, messageId, toolCalls) =>
    set((state) => ({
      messages: {
        byThreadId: {
          ...state.messages.byThreadId,
          [threadId]: (state.messages.byThreadId[threadId] ?? []).map((message) =>
            message.id === messageId ? { ...message, toolCalls } : message
          )
        }
      }
    })),

  updateAssistantToolResults: (threadId, messageId, results) =>
    set((state) => ({
      messages: {
        byThreadId: {
          ...state.messages.byThreadId,
          [threadId]: (state.messages.byThreadId[threadId] ?? []).map((message) => {
            if (message.id !== messageId) {
              return message;
            }

            const toolCalls = (message.toolCalls ?? []).map((toolCall) => {
              const parsedResult = [...results]
                .reverse()
                .map(resultName)
                .find((result) => result.name === toolCall.name && result.kind === toolCall.kind);

              if (!parsedResult) {
                return toolCall;
              }

              return {
                ...toolCall,
                result: parsedResult.body,
                status: parsedResult.isError ? ("error" as const) : ("done" as const)
              };
            });

            return { ...message, toolCalls };
          })
        }
      }
    })),

  toggleToolCall: (threadId, messageId, toolCallId) =>
    set((state) => ({
      messages: {
        byThreadId: {
          ...state.messages.byThreadId,
          [threadId]: (state.messages.byThreadId[threadId] ?? []).map((message) => {
            if (message.id !== messageId) {
              return message;
            }

            return {
              ...message,
              toolCalls: (message.toolCalls ?? []).map((toolCall) =>
                toolCall.id === toolCallId ? { ...toolCall, expanded: !toolCall.expanded } : toolCall
              )
            };
          })
        }
      }
    })),

  finalizeToolCalls: (threadId, messageId) =>
    set((state) => ({
      messages: {
        byThreadId: {
          ...state.messages.byThreadId,
          [threadId]: (state.messages.byThreadId[threadId] ?? []).map((message) =>
            message.id === messageId
              ? {
                  ...message,
                  toolCalls: (message.toolCalls ?? []).map((toolCall) => ({
                    ...toolCall,
                    expanded: false,
                    status: toolCall.status === "running" ? "done" : toolCall.status
                  }))
                }
              : message
          )
        }
      }
    })),

  startRun: () =>
    set((state) => ({
      runState: {
        ...initialRunState,
        status: "running",
        isStreaming: false,
        startedAt: Date.now(),
        statusText: "Deciding what to do..."
      },
      ui: {
        ...state.ui,
        stepsOpen: true
      }
    })),

  setRunId: (runId) =>
    set((state) => ({
      runState: {
        ...state.runState,
        runId
      }
    })),

  setRunStatus: (status, error = null) =>
    set((state) => ({
      runState: {
        ...state.runState,
        status,
        isStreaming: status === "running" ? state.runState.isStreaming : false,
        error,
        statusText: status === "done" ? "Completed" : status === "error" ? error ?? "Error" : state.runState.statusText
      },
      ui: {
        ...state.ui,
        stepsOpen: status === "running" || state.ui.stepsPinned ? state.ui.stepsOpen : false
      }
    })),

  addSteps: (steps) =>
    set((state) => ({
      runState: {
        ...state.runState,
        steps: [...state.runState.steps, ...steps]
      }
    })),

  resetSteps: () =>
    set((state) => ({
      runState: {
        ...state.runState,
        steps: []
      }
    })),

  setRunElapsed: (elapsedMs) =>
    set((state) => ({
      runState: {
        ...state.runState,
        elapsedMs
      }
    })),

  setStatusText: (statusText) =>
    set((state) => ({
      runState: {
        ...state.runState,
        statusText
      }
    })),

  setRegistry: (registry) =>
    set((state) => ({
      registry: {
        ...state.registry,
        ...registry,
        isLoading: false
      }
    })),

  setRegistryLoading: (isLoading) =>
    set((state) => ({
      registry: {
        ...state.registry,
        isLoading
      }
    })),

  updateRegistryActive: (name, active) =>
    set((state) => ({
      registry: {
        ...state.registry,
        tools: state.registry.tools.map((entry) => (entry.name === name ? { ...entry, active } : entry)),
        agents: state.registry.agents.map((entry) => (entry.name === name ? { ...entry, active } : entry))
      }
    })),

  setRegistryDrawerOpen: (drawerOpen) =>
    set((state) => ({
      registry: {
        ...state.registry,
        drawerOpen
      }
    })),

  setSidebarCollapsed: (sidebarCollapsed) =>
    set((state) => ({
      ui: {
        ...state.ui,
        sidebarCollapsed
      }
    })),

  setMobileSidebarOpen: (mobileSidebarOpen) =>
    set((state) => ({
      ui: {
        ...state.ui,
        mobileSidebarOpen
      }
    })),

  setStepsOpen: (stepsOpen) =>
    set((state) => ({
      ui: {
        ...state.ui,
        stepsOpen
      }
    })),

  setStepsPinned: (stepsPinned) =>
    set((state) => ({
      ui: {
        ...state.ui,
        stepsPinned,
        stepsOpen: stepsPinned ? true : state.ui.stepsOpen
      }
    }))
}));
