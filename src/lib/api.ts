import type {
  ActiveRegistryResponse,
  RegistryResponse,
  RunCreateBody,
  Thread,
  ThreadState
} from "@/types/jarvis";

export const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000").replace(/\/$/, "");

export class ApiError extends Error {
  status: number;
  details: unknown;

  constructor(message: string, status: number, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.details = details;
  }
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {})
    }
  });

  if (!response.ok) {
    let details: unknown = null;
    try {
      details = await response.json();
    } catch {
      details = await response.text().catch(() => null);
    }

    throw new ApiError(readableError(details) || response.statusText, response.status, details);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

export const api = {
  health: () => apiFetch<{ status: string; version: string; graph_id: string }>("/"),

  listThreads: (limit = 50) => apiFetch<Thread[]>(`/threads?limit=${limit}`),

  createThread: () =>
    apiFetch<Thread>("/threads", {
      method: "POST",
      body: JSON.stringify({ metadata: {} })
    }),

  deleteThread: (threadId: string) =>
    apiFetch<void>(`/threads/${threadId}`, {
      method: "DELETE"
    }),

  updateThreadMetadata: (threadId: string, metadata: Record<string, unknown>) =>
    apiFetch<Thread>(`/threads/${threadId}`, {
      method: "PATCH",
      body: JSON.stringify({ metadata })
    }),

  getThreadState: (threadId: string) => apiFetch<ThreadState>(`/threads/${threadId}/state`),

  streamRun: async (threadId: string, message: string, signal?: AbortSignal) => {
    const body: RunCreateBody = {
      assistant_id: "jarvis",
      input: { user_input: message },
      stream_mode: ["updates", "values", "messages"],
      multitask_strategy: "enqueue"
    };

    const response = await fetch(`${API_URL}/threads/${threadId}/runs/stream`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body),
      signal
    });

    if (!response.ok || !response.body) {
      let details: unknown = null;
      try {
        details = await response.json();
      } catch {
        details = await response.text().catch(() => null);
      }
      throw new ApiError(readableError(details) || response.statusText, response.status, details);
    }

    return {
      body: response.body,
      runId: response.headers.get("X-Run-ID")
    };
  },

  cancelRun: (threadId: string, runId: string) =>
    apiFetch<{ status: string; run_id: string }>(`/threads/${threadId}/runs/${runId}/cancel`, {
      method: "POST"
    }),

  listRegistry: () => apiFetch<RegistryResponse>("/registry"),

  listActiveRegistry: () => apiFetch<ActiveRegistryResponse>("/registry/active"),

  plugin: (name: string) =>
    apiFetch<{ status: string; message: string; name: string }>("/registry/plugin", {
      method: "POST",
      body: JSON.stringify({ name })
    }),

  plugout: (name: string) =>
    apiFetch<{ status: string; message: string; name: string }>("/registry/plugout", {
      method: "POST",
      body: JSON.stringify({ name })
    }),

  reloadRegistry: () =>
    apiFetch<{ status: string; tools: number; agents: number }>("/registry/reload", {
      method: "POST"
    })
};

function readableError(details: unknown) {
  if (typeof details === "string") {
    return details;
  }

  if (details && typeof details === "object" && "detail" in details) {
    const detail = (details as { detail?: unknown }).detail;
    return typeof detail === "string" ? detail : JSON.stringify(detail);
  }

  return "";
}
