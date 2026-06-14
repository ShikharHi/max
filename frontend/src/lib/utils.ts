import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { Message } from "@/types/jarvis";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function titleFromMessage(value: string) {
  const raw = value.trim().slice(0, 40);
  if (!raw) return "New conversation";
  return raw
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase())
    .replace(/\s+/g, " ");
}

export function relativeTime(date?: string) {
  if (!date) return "Now";
  const delta = Date.now() - new Date(date).getTime();
  const minute = 60_000;
  const hour = minute * 60;
  const day = hour * 24;
  if (delta < minute) return "Now";
  if (delta < hour) return `${Math.floor(delta / minute)}m ago`;
  if (delta < day) return `${Math.floor(delta / hour)}h ago`;
  if (delta < day * 2) return "Yesterday";
  return `${Math.floor(delta / day)}d ago`;
}

export function uid(prefix = "id") {
  return `${prefix}_${Math.random().toString(36).slice(2)}_${Date.now().toString(36)}`;
}

export function stringifyPreview(value: unknown) {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export function extractFinalAnswer(value: unknown) {
  if (!value || typeof value !== "object") return "";
  const record = value as Record<string, unknown>;
  const direct = record.final_answer ?? record.answer ?? record.output;
  if (typeof direct === "string") return direct;
  if (record.values && typeof record.values === "object") {
    const values = record.values as Record<string, unknown>;
    const nested = values.final_answer ?? values.answer ?? values.output;
    if (typeof nested === "string") return nested;
  }
  return "";
}

export function parseMaybeJson(input: string): unknown {
  try {
    return JSON.parse(input);
  } catch {
    return null;
  }
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

export function partialAnswerFromJson(buffer: string) {
  if (!buffer) return "";
  const parsed = parseMaybeJson(buffer);
  if (parsed && typeof parsed === "object") {
    const record = parsed as Record<string, unknown>;
    const direct = record.answer ?? record.final_answer ?? record.output;
    if (typeof direct === "string") return direct;
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

export function extractToken(data: unknown) {
  if (typeof data === "string") {
    const trimmed = data.trim();
    if (!trimmed) return "";
    if ((trimmed.startsWith("{") && trimmed.endsWith("}")) || (trimmed.startsWith("[") && trimmed.endsWith("]"))) {
      try {
        return extractToken(JSON.parse(trimmed));
      } catch {
        return trimmed;
      }
    }
    if (trimmed === "null" || trimmed === "undefined") return "";
    return trimmed;
  }
  if (!data || typeof data !== "object") return "";
  const record = data as Record<string, unknown>;
  const token = record.token ?? record.content ?? record.delta;
  if (typeof token === "string") {
    const trimmed = token.trim();
    if (!trimmed || trimmed === "null" || trimmed === "undefined") return "";
    if ((trimmed.startsWith("{") && trimmed.endsWith("}")) || (trimmed.startsWith("[") && trimmed.endsWith("]"))) {
      try {
        return extractToken(JSON.parse(trimmed));
      } catch {
        return trimmed;
      }
    }
    return trimmed;
  }
  if (Array.isArray(token)) {
    return token
      .map((part) => {
        if (typeof part === "string") return part;
        if (part && typeof part === "object") {
          const text = (part as Record<string, unknown>).text ?? (part as Record<string, unknown>).content;
          return typeof text === "string" ? text : "";
        }
        return "";
      })
      .join("");
  }
  if (token && typeof token === "object") {
    const text = (token as Record<string, unknown>).text ?? (token as Record<string, unknown>).content;
    return typeof text === "string" ? text : "";
  }
  return "";
}

export function isUserMessageRecord(record: Record<string, unknown>) {
  const role = String(record.role ?? record.type ?? "").toLowerCase();
  return role === "user" || role === "human" || role === "humanmessage";
}

export function isAssistantMessageRecord(record: Record<string, unknown>) {
  const role = String(record.role ?? record.type ?? "").toLowerCase();
  return role === "assistant" || role === "ai" || role === "aimessage" || role === "ai_message";
}

export function extractMessagesFromValues(values: unknown) {
  if (!values || typeof values !== "object") return [];
  const rows = (values as Record<string, unknown>).messages;
  return Array.isArray(rows) ? rows : [];
}

export function titleFromValues(values: unknown) {
  const firstUser = extractMessagesFromValues(values).find((row) => {
    return row && typeof row === "object" && isUserMessageRecord(row as Record<string, unknown>);
  });
  if (!firstUser || typeof firstUser !== "object") return undefined;
  const content = (firstUser as Record<string, unknown>).content;
  return typeof content === "string" && content.trim() ? titleFromMessage(content) : undefined;
}

export function titleFromMessages(messages?: Message[]) {
  const firstUser = messages?.find((message) => message.role === "user")?.content;
  return typeof firstUser === "string" && firstUser.trim() ? titleFromMessage(firstUser) : undefined;
}
