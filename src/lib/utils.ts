import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { BackendMessage, Invocation, Message, StepEvent, Thread, ThreadValues, ToolCall } from "@/types/jarvis";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function compactId(prefix: string) {
  const random =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2);

  return `${prefix}-${random}`;
}

export function titleCase(input: string) {
  return input
    .toLowerCase()
    .replace(/\b[a-z]/g, (char) => char.toUpperCase())
    .replace(/\s+/g, " ")
    .trim();
}

export function threadTitleFromMessages(messages: Message[] | undefined) {
  const firstUser = messages?.find((message) => message.role === "user")?.content;
  if (!firstUser?.trim()) {
    return "New conversation";
  }

  const clipped = firstUser.replace(/\s+/g, " ").trim().slice(0, 40);
  return titleCase(clipped);
}

export function threadTitle(thread: Thread, messages?: Message[]) {
  const metadataTitle = typeof thread.metadata?.title === "string" ? thread.metadata.title : "";
  if (metadataTitle.trim()) {
    return metadataTitle;
  }

  const localTitle = threadTitleFromMessages(messages);
  if (localTitle !== "New conversation") {
    return localTitle;
  }

  return threadTitleFromValues(thread.values);
}

export function threadTitleFromValues(values?: ThreadValues | null) {
  const firstHuman = values?.messages?.find((message) => isHumanMessage(message))?.content;
  if (!firstHuman?.trim()) {
    return "New conversation";
  }

  return titleCase(firstHuman.replace(/\s+/g, " ").trim().slice(0, 40));
}

export function relativeTime(value?: string | number | Date) {
  if (!value) {
    return "Now";
  }

  const date = value instanceof Date ? value : new Date(value);
  const diff = date.getTime() - Date.now();
  const abs = Math.abs(diff);

  const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ["year", 1000 * 60 * 60 * 24 * 365],
    ["month", 1000 * 60 * 60 * 24 * 30],
    ["week", 1000 * 60 * 60 * 24 * 7],
    ["day", 1000 * 60 * 60 * 24],
    ["hour", 1000 * 60 * 60],
    ["minute", 1000 * 60],
    ["second", 1000]
  ];

  const formatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  for (const [unit, ms] of units) {
    if (abs >= ms || unit === "second") {
      return formatter.format(Math.round(diff / ms), unit);
    }
  }

  return "Now";
}

export function formatElapsed(ms: number) {
  if (ms < 1000) {
    return `${Math.max(0, Math.round(ms))}ms`;
  }
  return `${(ms / 1000).toFixed(1)}s`;
}

export function safeJson(value: unknown) {
  if (typeof value === "string") {
    return value;
  }

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export function parseMaybeJson(input: string): unknown {
  try {
    return JSON.parse(input);
  } catch {
    return null;
  }
}

export function extractAnswer(content: string) {
  const parsed = parseMaybeJson(content);
  if (isRecord(parsed) && typeof parsed.answer === "string") {
    return parsed.answer;
  }
  return content;
}

export function partialAnswerFromJson(buffer: string) {
  const parsed = parseMaybeJson(buffer);
  if (isRecord(parsed) && typeof parsed.answer === "string") {
    return parsed.answer;
  }

  const answerIndex = buffer.indexOf('"answer"');
  if (answerIndex === -1) {
    return "";
  }

  const afterAnswer = buffer.slice(answerIndex);
  const colonIndex = afterAnswer.indexOf(":");
  if (colonIndex === -1) {
    return "";
  }

  const quoteStart = afterAnswer.indexOf('"', colonIndex);
  if (quoteStart === -1) {
    return "";
  }

  const raw = afterAnswer.slice(quoteStart + 1);
  return decodePartialJsonString(raw);
}

export function decodePartialJsonString(raw: string) {
  let output = "";
  let escaped = false;

  for (const char of raw) {
    if (escaped) {
      if (char === "n") output += "\n";
      else if (char === "t") output += "\t";
      else if (char === "r") output += "\r";
      else output += char;
      escaped = false;
      continue;
    }

    if (char === "\\") {
      escaped = true;
      continue;
    }

    if (char === '"') {
      break;
    }

    output += char;
  }

  return output;
}

export function messagesFromThreadValues(threadId: string, values?: ThreadValues | null): Message[] {
  const backendMessages = values?.messages ?? [];
  const result: Message[] = [];

  for (const message of backendMessages) {
    const content = typeof message.content === "string" ? message.content : "";
    if (!content.trim()) {
      continue;
    }

    if (isHumanMessage(message)) {
      result.push({
        id: message.id ?? compactId("user"),
        threadId,
        role: "user",
        content,
        createdAt: new Date().toISOString(),
        status: "complete"
      });
      continue;
    }

    const assistantContent = extractAnswer(content);
    if (!assistantContent.trim() || isPlanningOnlyJson(content)) {
      continue;
    }

    result.push({
      id: message.id ?? compactId("assistant"),
      threadId,
      role: "assistant",
      content: assistantContent,
      createdAt: new Date().toISOString(),
      status: "complete"
    });
  }

  if (values?.final_answer?.trim()) {
    const last = result[result.length - 1];
    if (!last || last.role !== "assistant" || last.content.trim() !== values.final_answer.trim()) {
      result.push({
        id: compactId("assistant"),
        threadId,
        role: "assistant",
        content: values.final_answer,
        createdAt: new Date().toISOString(),
        status: "complete",
        toolCalls: invocationsToToolCalls(values.invocations ?? [], false)
      });
    }
  }

  return dedupeMessages(result);
}

export function invocationsToToolCalls(invocations: Invocation[], expanded = true): ToolCall[] {
  return invocations.map((invocation, index) => ({
    id: compactId(`${invocation.type || "tool"}-${invocation.name || index}`),
    kind: invocation.type === "agent" ? "agent" : "tool",
    name: invocation.name || "unknown",
    input: invocation.input ?? {},
    status: "running",
    expanded
  }));
}

export function resultName(result: string) {
  const match = result.match(/^\[(tool|agent):([^\]]+)\]\s*([\s\S]*)$/);
  if (!match) {
    return { kind: "tool" as const, name: "unknown", body: result, isError: /error/i.test(result) };
  }

  return {
    kind: match[1] === "agent" ? ("agent" as const) : ("tool" as const),
    name: match[2],
    body: match[3],
    isError: /ERROR:/i.test(match[3])
  };
}

export function statusTextFromUpdate(update: unknown) {
  if (!isRecord(update)) {
    return "Processing...";
  }

  if (isRecord(update.router)) {
    const router = update.router;
    if (router.decision === "use_tools") return "Deciding what to do...";
    if (router.decision === "use_agents") return "Planning agent work...";
    if (router.decision === "answer") return "Composing final answer...";
  }

  if (isRecord(update.executor)) {
    const results = Array.isArray(update.executor.execution_results) ? update.executor.execution_results : [];
    const latest = typeof results[results.length - 1] === "string" ? results[results.length - 1] : "";
    const parsed = latest ? resultName(latest) : null;
    if (parsed?.kind === "agent") return `Running agent: ${parsed.name}`;
    if (parsed?.kind === "tool") return `Using tool: ${parsed.name}`;
    return "Running delegated work...";
  }

  return "Processing...";
}

export function nodeUpdatesToSteps(update: unknown, runStartedAt: number) {
  const steps: StepEvent[] = [];
  if (!isRecord(update)) {
    return steps;
  }

  if (isRecord(update.router)) {
    const router = update.router;
    steps.push({
      id: compactId("step-router"),
      node: "router" as const,
      timestamp: Date.now(),
      elapsedMs: Date.now() - runStartedAt,
      raw: router,
      decision: typeof router.decision === "string" ? router.decision : undefined,
      plan: typeof router.plan === "string" ? router.plan : undefined,
      invocations: Array.isArray(router.invocations) ? (router.invocations as Invocation[]) : undefined,
      status: "done" as const
    });
  }

  if (isRecord(update.executor)) {
    const executor = update.executor;
    steps.push({
      id: compactId("step-executor"),
      node: "executor" as const,
      timestamp: Date.now(),
      elapsedMs: Date.now() - runStartedAt,
      raw: executor,
      results: Array.isArray(executor.execution_results)
        ? executor.execution_results.filter((value): value is string => typeof value === "string")
        : undefined,
      status: "done" as const
    });
  }

  return steps;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isHumanMessage(message: BackendMessage) {
  const type = message.type?.toLowerCase() ?? "";
  return type.includes("human") || type.includes("user");
}

function isPlanningOnlyJson(content: string) {
  const parsed = parseMaybeJson(content);
  return isRecord(parsed) && typeof parsed.decision === "string" && parsed.decision !== "answer";
}

function dedupeMessages(messages: Message[]) {
  const seen = new Set<string>();
  return messages.filter((message) => {
    const key = `${message.role}:${message.content}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}
