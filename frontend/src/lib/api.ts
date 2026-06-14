import { titleFromValues } from "@/lib/utils";
import type { RegistryEntry, Thread } from "@/types/jarvis";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers
    }
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(text || `JARVIS API returned ${response.status}`);
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

function normalizeThread(raw: unknown): Thread {
  const row = raw as Record<string, unknown>;
  const id = String(row.id ?? row.thread_id ?? row.threadId ?? crypto.randomUUID());
  const metadata = row.metadata && typeof row.metadata === "object" ? (row.metadata as Record<string, unknown>) : {};
  const values = row.values ?? row.thread_values;
  const derivedTitle = titleFromValues(values);
  return {
    id,
    title: typeof row.title === "string" ? row.title : typeof metadata.title === "string" ? metadata.title : derivedTitle,
    createdAt: typeof row.created_at === "string" ? row.created_at : typeof row.createdAt === "string" ? row.createdAt : undefined,
    updatedAt: typeof row.updated_at === "string" ? row.updated_at : typeof row.updatedAt === "string" ? row.updatedAt : undefined,
    status: row.status === "busy" ? "busy" : "idle",
    values
  };
}

function normalizeRegistryEntry(raw: unknown): RegistryEntry {
  const row = raw as Record<string, unknown>;
  const type = row.type === "agent" || row.kind === "agent" ? "agent" : "tool";
  return {
    name: String(row.name ?? row.id ?? "unknown"),
    type,
    version: typeof row.version === "string" ? row.version : "1.0.0",
    description: typeof row.description === "string" ? row.description : "No description provided.",
    tags: Array.isArray(row.tags) ? row.tags.map(String) : [],
    active: Boolean(row.active ?? row.enabled),
    icon: typeof row.icon === "string" ? row.icon : undefined
  };
}

export const api = {
  baseUrl: API_URL,

  async getThreads() {
    const data = await request<unknown>("/threads");
    const rows: unknown[] = Array.isArray(data) ? data : Array.isArray((data as Record<string, unknown>)?.threads) ? ((data as Record<string, unknown>).threads as unknown[]) : [];
    return rows.map(normalizeThread);
  },

  async createThread() {
    const data = await request<unknown>("/threads", { method: "POST", body: JSON.stringify({}) });
    return normalizeThread(data);
  },

  async updateThreadMetadata(threadId: string, metadata: Record<string, unknown>) {
    const data = await request<unknown>(`/threads/${threadId}`, {
      method: "PATCH",
      body: JSON.stringify({ metadata })
    });
    return normalizeThread(data);
  },

  async deleteThread(threadId: string) {
    await request<void>(`/threads/${threadId}`, { method: "DELETE" });
  },

  async getThreadState(threadId: string) {
    return request<unknown>(`/threads/${threadId}/state`);
  },

  async streamRun(threadId: string, input: string, signal?: AbortSignal) {
    const response = await fetch(`${API_URL}/threads/${threadId}/runs/stream`, {
      method: "POST",
      signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        assistant_id: "jarvis",
        input: { user_input: input },
        stream_mode: ["updates", "values", "messages"],
        multitask_strategy: "enqueue"
      })
    });
    if (!response.ok || !response.body) {
      throw new Error(await response.text().catch(() => "Unable to start run"));
    }
    return response.body;
  },

  async cancelRun(threadId: string, runId: string) {
    return request<void>(`/threads/${threadId}/runs/${runId}/cancel`, { method: "POST" });
  },

  async getRegistry() {
    const data = await request<unknown>("/registry");
    const rows = Array.isArray(data) ? data : [
      ...(((data as Record<string, unknown>)?.tools as unknown[]) ?? []),
      ...(((data as Record<string, unknown>)?.agents as unknown[]) ?? [])
    ];
    return rows.map(normalizeRegistryEntry);
  },

  async getActiveRegistry() {
    const entries = await this.getRegistry();
    return entries.filter((entry) => entry.active);
  },

  async plugin(name: string) {
    return request<void>("/registry/plugin", { method: "POST", body: JSON.stringify({ name }) });
  },

  async plugout(name: string) {
    return request<void>("/registry/plugout", { method: "POST", body: JSON.stringify({ name }) });
  },

  async reloadRegistry() {
    return request<void>("/registry/reload", { method: "POST" });
  }
};
