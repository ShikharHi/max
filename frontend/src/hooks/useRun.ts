"use client";

import { useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { extractFinalAnswer, partialAnswerFromJson, titleFromMessage, uid } from "@/lib/utils";
import { useJarvisStore } from "@/store/useJarvisStore";
import type { StepEvent, StepInvocation, ToolCall } from "@/types/jarvis";
import { useSSEStream } from "./useSSEStream";

function normalizeInvocationId(row: Record<string, unknown>, type: "tool" | "agent") {
  if (row.id != null) return String(row.id);
  const name = String(row.name ?? row.tool ?? row.agent ?? "unknown");
  const args = row.input ?? row.args ?? row.arguments ?? {};
  const argsString =
    typeof args === "object" && args !== null && Object.keys(args).length > 0
      ? JSON.stringify(args)
      : "";
  return argsString ? `${type}:${name}:${argsString}` : `${type}:${name}`;
}

function invocationFromRaw(raw: unknown): StepInvocation[] {
  if (!raw || typeof raw !== "object") return [];
  const record = raw as Record<string, unknown>;
  const candidates = record.invocations ?? record.tools ?? record.agents ?? record.tool_calls ?? record.calls;
  if (!Array.isArray(candidates)) {
    const results = record.execution_results;
    if (!Array.isArray(results)) return [];
    return results.map((result, index) => {
      const text = String(result);
      const match = text.match(/^\[(tool|agent):([^\]]+)\]/i);
      return {
        id: uid("result"),
        type: match?.[1]?.toLowerCase() === "agent" ? "agent" : "tool",
        name: match?.[2] ?? `result_${index + 1}`,
        status: "done",
        result: text
      };
    });
  }
  return candidates.map((item) => {
    const row = item as Record<string, unknown>;
    const type = row.type === "agent" || row.kind === "agent" ? "agent" : "tool";
    return {
      id: normalizeInvocationId(row, type),
      type,
      name: String(row.name ?? row.tool ?? row.agent ?? "unknown"),
      status: row.status === "error" ? "error" : row.status === "done" ? "done" : row.status === "planned" ? "planned" : "running",
      input: row.input ?? row.args,
      result: row.result ?? row.output
    };
  });
}

function unwrapUpdate(data: unknown): { node: "router" | "executor"; payload: Record<string, unknown> } {
  const record = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
  if (record.router && typeof record.router === "object") return { node: "router", payload: record.router as Record<string, unknown> };
  if (record.executor && typeof record.executor === "object") return { node: "executor", payload: record.executor as Record<string, unknown> };
  const node = String(record.node ?? record.event ?? "").toLowerCase().includes("executor") ? "executor" : "router";
  return { node, payload: record };
}

function stepFromUpdate(data: unknown, startedAt: number): StepEvent {
  const { node, payload } = unwrapUpdate(data);
  const decisionRaw = String(payload.decision ?? payload.route ?? "");
  const decision = decisionRaw.includes("agent") ? "use_agents" : decisionRaw.includes("tool") ? "use_tools" : decisionRaw.includes("answer") ? "answer" : undefined;
  const rawPlan = typeof payload.plan === "string" ? payload.plan : typeof payload.message === "string" ? payload.message : undefined;
  return {
    id: uid("step"),
    node,
    elapsedMs: Date.now() - startedAt,
    decision,
    plan: sanitizeUpdateStatus(rawPlan ?? undefined),
    invocations: invocationFromRaw(payload),
    raw: data
  };
}

function toolCallsFromStep(step: StepEvent): ToolCall[] {
  return (step.invocations ?? []).map((invocation) => ({
    id: invocation.id,
    type: invocation.type,
    name: invocation.name,
    input: invocation.input,
    result: invocation.result,
    status: invocation.status,
    expanded: true
  }));
}

/**
 * Detects whether a string contains router/trace metadata patterns.
 * This catches both well-formed JSON and malformed/partial JSON fragments
 * that the LLM emits as part of its structured decision output.
 */
function containsTraceMetadata(raw: string) {
  // Match key patterns that appear in router decision JSON — with or without
  // surrounding braces/quotes.  Covers: "decision":"use_agents", decision:use_agents,
  // "invocations":[...], "plan":"...", etc.
  return /(?:"?(?:decision|invocations|tool_calls|execution_results)"?\s*:\s*"?(?:use_(?:agents|tools)|answer|\[))|(?:"?(?:plan|route)"?\s*:\s*"[^"]{0,200}")|(?:"type"\s*:\s*"(?:agent|tool)")/.test(raw);
}

/**
 * Returns true if the entire token is trace/metadata that should be dropped.
 * Unlike the old approach that tried to *extract* useful text from mixed
 * metadata+answer tokens, this simply answers: "is this token junk?"
 *
 * The real answer arrives via `onValues` (final_answer) so we can afford to
 * be aggressive here.
 */
function isTraceOnlyToken(raw: string): boolean {
  if (!raw) return false;
  const trimmed = raw.trim();
  if (!trimmed) return false;

  // 1. Starts with { or [ — it's a JSON blob (or fragment), drop it.
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) return true;

  // 2. Contains trace metadata key patterns — drop it.
  if (containsTraceMetadata(trimmed)) return true;

  // 3. Looks like a continuation of a JSON value (starts with quotes, colons, commas
  //    followed by trace keys).
  if (/^[\s"':,\[\]{}]*(?:decision|plan|invocations|type|name|agent|tool|input|action|status|text|date|route|tool_calls|agents|tools)\s*["':]/i.test(trimmed)) {
    return true;
  }

  return false;
}

/**
 * Attempts to extract clean human-readable text from a token that may
 * contain a mix of JSON metadata and trailing plain text.
 *
 * For example:  `..."action":"list"}Check Google Calendar for meetings today`
 * should return: `Check Google Calendar for meetings today`
 *
 * Returns empty string if nothing usable is found.
 */
function extractCleanText(raw: string): string {
  if (!raw) return "";
  const trimmed = raw.trim();

  // If the string contains balanced braces, extract text after the last closing brace.
  let depth = 0;
  let lastClose = -1;
  let inString = false;
  let escaped = false;

  for (let i = 0; i < trimmed.length; i++) {
    const ch = trimmed[i];
    if (escaped) { escaped = false; continue; }
    if (ch === "\\") { escaped = true; continue; }
    if (ch === '"' && depth > 0) { inString = !inString; continue; }
    if (inString) continue;
    if (ch === "{" || ch === "[") depth++;
    if (ch === "}" || ch === "]") {
      depth--;
      if (depth === 0) lastClose = i;
    }
  }

  if (lastClose > -1) {
    const after = trimmed.slice(lastClose + 1).replace(/^[\s:,"'\]})+]+/, "").trim();
    // Make sure what remains is actual text, not more metadata
    if (after && !containsTraceMetadata(after) && !/^[\s"':,\[\]{}]*$/.test(after)) {
      return after;
    }
    return "";
  }

  // No braces found — check if the entire thing is just key:value pairs without braces.
  // Try to find plain text after the last value in a key:"value" chain.
  const lastQuotedValue = /(?:"[^"]*")\s*$/;
  if (!lastQuotedValue.test(trimmed)) {
    // There might be trailing plain text after metadata.  Find it by stripping
    // all recognisable key:value patterns from the left.
    const stripped = trimmed
      .replace(/"?(?:decision|plan|invocations|type|name|agent|tool|input|action|status|text|date|route|tool_calls|agents|tools)"?\s*:\s*(?:"[^"]*"|[^,"\s}\]]+)/gi, "")
      .replace(/^[\s:,"'\[\]{}]+/, "")
      .replace(/[\s:,"'\[\]{}]+$/, "")
      .trim();
    if (stripped && !containsTraceMetadata(stripped) && stripped.length > 2) {
      return stripped;
    }
  }

  return "";
}

function sanitizeTokenContent(raw: string) {
  if (!raw) return "";
  // If the whole token is trace metadata, return empty
  if (isTraceOnlyToken(raw)) {
    // Last chance: try to extract trailing human text
    return extractCleanText(raw);
  }
  return raw.replace(/^[\s\]\}\)]+/, "").trim();
}

function sanitizeUpdateStatus(status: string | undefined) {
  if (!status) return undefined;
  if (containsTraceMetadata(status)) return undefined;
  const cleaned = status.trim();
  if (!cleaned) return undefined;
  return cleaned;
}

function mergeToolCalls(existing: ToolCall[] = [], next: ToolCall[]): ToolCall[] {
  const byId = new Map(existing.map((call) => [call.id, call]));
  const merged: ToolCall[] = [];

  for (const call of existing) byId.set(call.id, call);
  for (const call of next) {
    const previous = byId.get(call.id);
    const mergedCall = previous
      ? {
        ...previous,
        ...call,
        input: call.input === undefined || (typeof call.input === "object" && call.input !== null && Object.keys(call.input).length === 0)
          ? previous.input
          : call.input,
        result: call.result === undefined ? previous.result : call.result,
        status: call.status || previous.status,
        expanded: previous.expanded ?? call.expanded
      }
      : call;
    byId.set(call.id, mergedCall);
  }

  for (const call of existing) {
    const mergedCall = byId.get(call.id);
    if (mergedCall) merged.push(mergedCall);
  }
  for (const call of next) {
    if (!existing.some((previous) => previous.id === call.id)) {
      merged.push(byId.get(call.id) ?? call);
    }
  }

  return merged;
}

/** Build a human-readable label for a live invocation */
function invocationLabel(step: StepEvent): string | null {
  const invocations = step.invocations ?? [];
  if (!invocations.length) return null;

  const lines = invocations.map((inv) => {
    const emoji = inv.type === "agent" ? "🤖" : "🔧";
    const inputSummary =
      inv.input && typeof inv.input === "object"
        ? Object.entries(inv.input as Record<string, unknown>)
          .map(([k, v]) => `${k}: ${String(v).slice(0, 40)}`)
          .join(", ")
        : typeof inv.input === "string"
          ? inv.input.slice(0, 60)
          : null;
    return `${emoji} ${inv.type === "agent" ? "Agent" : "Tool"}: **${inv.name}**${inputSummary ? ` — ${inputSummary}` : ""}`;
  });

  return lines.join("\n");
}

export function useRun() {
  const { consume, cancel } = useSSEStream();
  const router = useRouter();
  const abortRef = useRef<AbortController | null>(null);
  const tokenBufferRef = useRef("");
  const store = useJarvisStore();

  const stop = useCallback(async () => {
    const threadId = store.threads.activeId;
    const runId = store.runState.runId;
    abortRef.current?.abort();
    cancel();
    if (threadId && runId) {
      await api.cancelRun(threadId, runId).catch(() => undefined);
    }
    store.finishRun("done");
  }, [cancel, store]);

  const sendMessage = useCallback(
    async (content: string, existingThreadId?: string, regenerateAssistantId?: string) => {
      const trimmed = content.trim();
      if (!trimmed) return;

      // ── Determine thread ──────────────────────────────────────────────────
      // We no longer optimistically add a "pending" thread to the sidebar.
      // The thread is created on the backend and only added to the sidebar
      // AFTER the run completes (inside `finalize`).
      let threadId = existingThreadId ?? store.threads.activeId;
      let isNewThread = false;

      if (!threadId) {
        // Create on backend but DON'T call upsertThread yet — sidebar stays clean.
        let thread;
        try {
          thread = await api.createThread();
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unable to create thread";
          store.setConnectionError(message);
          return;
        }
        threadId = thread.id;
        isNewThread = true;
        // Silently set as active and initialise message cache, no sidebar entry yet.
        store.setActiveThread(threadId);
        store.setMessages(threadId, []);
      }

      // ── Messages ──────────────────────────────────────────────────────────
      const userMessage = {
        id: uid("user"),
        role: "user" as const,
        content: trimmed,
        createdAt: new Date().toISOString(),
        status: "done" as const
      };
      const assistantId = regenerateAssistantId ?? uid("assistant");
      const assistantMessage = {
        id: assistantId,
        role: "assistant" as const,
        content: "",
        createdAt: new Date().toISOString(),
        status: "streaming" as const,
        toolCalls: [],
        updates: ["Deciding what to do..."]
      };

      if (!regenerateAssistantId) store.appendMessage(threadId, userMessage);
      store.appendMessage(threadId, assistantMessage);

      const generatedTitle = titleFromMessage(trimmed);
      store.startRun();

      abortRef.current = new AbortController();
      const startedAt = Date.now();

      // Tracks whether we have started receiving real answer tokens
      // so we can clear the live invocation label at that point.
      let answerStarted = false;

      try {
        const stream = await api.streamRun(threadId, trimmed, abortRef.current.signal);
        // Navigate to the thread URL now that the run has started to avoid
        // a race where navigation interrupts the streaming connection.
        void router.push(`/c/${threadId}`);

        let finished = false;
        tokenBufferRef.current = "";

        const finalize = () => {
          if (finished) return;
          finished = true;

          const current = useJarvisStore.getState().messages.byThreadId[threadId!]?.find((m) => m.id === assistantId);

          store.updateMessage(threadId!, assistantId, {
            status: "done",
            // Clear live invocation label from updates on finish
            updates: (current?.updates ?? []).filter((u) => !u.startsWith("__live__:")),
            toolCalls: (current?.toolCalls ?? []).map((call) => ({ ...call, expanded: false }))
          });

          // ── NOW add to sidebar ─────────────────────────────────────────────
          // The thread is revealed in the sidebar only after the first run
          // completes successfully.
          const existingInSidebar = useJarvisStore.getState().threads.list.find((t) => t.id === threadId);
          if (!existingInSidebar || isNewThread) {
            store.upsertThread({
              id: threadId!,
              title: generatedTitle ?? "New conversation",
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              status: "idle"
            });
            // Persist the title
            api.updateThreadMetadata(threadId!, { title: generatedTitle ?? "New conversation" }).catch(() => undefined);
          } else {
            store.upsertThread({ id: threadId!, status: "idle", updatedAt: new Date().toISOString() });
          }

          store.finishRun("done");
        };

        await consume(stream, {
          onMetadata: (data) => {
            if (finished) return;
            const runId = (data as Record<string, unknown>)?.run_id ?? (data as Record<string, unknown>)?.runId;
            if (runId) store.setRunId(String(runId));
          },

          onUpdates: (data) => {
            if (finished) return;
            const step = stepFromUpdate(data, startedAt);
            store.addStep(step);
            const toolCalls = toolCallsFromStep(step);

            // Build a live invocation label (shows tool/agent being called).
            const liveLabel = invocationLabel(step);
            const current = useJarvisStore.getState().messages.byThreadId[threadId!]?.find((m) => m.id === assistantId);

            // Filter out any previous __live__ update, then append the new one.
            const cleanUpdates = (current?.updates ?? []).filter((u) => !u.startsWith("__live__:"));
            const nextUpdates = liveLabel
              ? [...cleanUpdates, `__live__:${liveLabel}`]
              : cleanUpdates;

            store.updateMessage(threadId!, assistantId, {
              updates: nextUpdates,
              toolCalls: mergeToolCalls(current?.toolCalls ?? [], toolCalls)
            });
          },

          onValues: (data) => {
            if (finished) return;
            const answer = extractFinalAnswer(data);
            if (answer) {
              answerStarted = true;
              // Clear live invocation label when final answer arrives.
              const current = useJarvisStore.getState().messages.byThreadId[threadId!]?.find((m) => m.id === assistantId);
              store.updateMessage(threadId!, assistantId, {
                content: answer,
                updates: (current?.updates ?? []).filter((u) => !u.startsWith("__live__:"))
              });
              finalize();
            }
          },

          onToken: (token: unknown) => {
            if (finished) return;
            if (!token) return;
            let tokenContent = "";
            if (typeof token === "object" && token !== null && "content" in token) {
              tokenContent = String((token as Record<string, unknown>).content ?? "");
            } else {
              tokenContent = String(token);
            }
            if (!tokenContent) return;

            tokenBufferRef.current += tokenContent;
            const parsedAnswer = partialAnswerFromJson(tokenBufferRef.current);
            const current = useJarvisStore.getState().messages.byThreadId[threadId!]?.find((m) => m.id === assistantId);

            const displayToken = sanitizeTokenContent(tokenContent);
            const isJsonFragment =
              tokenContent.trim().startsWith("{") ||
              tokenContent.trim().startsWith("[") ||
              tokenContent.includes('"answer"');

            // Drop tokens that are trace metadata (decisions, plans, invocations).
            // The real answer will arrive via onValues (final_answer).
            if (isTraceOnlyToken(tokenContent) && !displayToken) {
              tokenBufferRef.current = "";
              return;
            }

            // If sanitization found displayable text but it still looks like metadata, drop it.
            if (displayToken && containsTraceMetadata(displayToken)) {
              tokenBufferRef.current = "";
              return;
            }

            // Once real answer tokens start arriving, clear the live label.
            if (!isJsonFragment && displayToken && !answerStarted) {
              answerStarted = true;
              const cleanUpdates = (current?.updates ?? []).filter((u) => !u.startsWith("__live__:"));
              store.updateMessage(threadId!, assistantId, { updates: cleanUpdates });
            }

            if (parsedAnswer) {
              store.updateMessage(threadId!, assistantId, { content: parsedAnswer });
            } else if (!isJsonFragment && displayToken) {
              store.updateMessage(threadId!, assistantId, {
                content: `${current?.content ?? ""}${displayToken}`
              });
            }
          },

          onError: (error) => {
            if (finished) return;
            finished = true;
            const record = error && typeof error === "object" ? (error as Record<string, unknown>) : {};
            const message =
              error instanceof Error
                ? error.message
                : typeof record.error === "string"
                  ? record.error
                  : "Run failed";
            store.updateMessage(threadId!, assistantId, { content: message, status: "error" });
            store.finishRun("error");
          },

          onEnd: finalize
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unable to connect to JARVIS";
        store.updateMessage(threadId, assistantId, { content: message, status: "error" });
        store.upsertThread({ id: threadId, status: "idle" });
        store.finishRun("error");
      }
    },
    [consume, router, store]
  );

  useEffect(() => {
    if (store.runState.status !== "running" || !store.runState.startedAt) return;
    const timer = window.setInterval(
      () => store.setElapsedMs(Date.now() - (store.runState.startedAt ?? Date.now())),
      100
    );
    return () => window.clearInterval(timer);
  }, [store, store.runState.status, store.runState.startedAt]);

  return { sendMessage, stop };
}