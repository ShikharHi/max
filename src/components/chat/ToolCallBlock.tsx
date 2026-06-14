"use client";

import { Bot, Check, ChevronDown, ChevronRight, Loader2, Wrench, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn, safeJson } from "@/lib/utils";
import { useJarvisStore } from "@/store/useJarvisStore";
import type { Message, ToolCall } from "@/types/jarvis";

export function ToolCallBlock({ message, toolCall }: { message: Message; toolCall: ToolCall }) {
  const toggleToolCall = useJarvisStore((state) => state.toggleToolCall);
  const isAgent = toolCall.kind === "agent";
  const Icon = isAgent ? Bot : Wrench;

  return (
    <div
      className={cn(
        "overflow-hidden rounded-lg border border-jarvis-border bg-[#0d0d14]",
        isAgent ? "border-l-2 border-l-jarvis-cyan" : "border-l-2 border-l-jarvis-violet"
      )}
    >
      <button
        type="button"
        onClick={() => toggleToolCall(message.threadId, message.id, toolCall.id)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left"
      >
        <Icon className={cn("h-4 w-4", isAgent ? "text-jarvis-cyan" : "text-jarvis-violet")} />
        <span className="min-w-0 flex-1 truncate font-mono text-xs text-jarvis-text">{toolCall.name}</span>
        <StatusIcon status={toolCall.status} />
        {toolCall.expanded ? (
          <ChevronDown className="h-4 w-4 text-jarvis-secondary" />
        ) : (
          <ChevronRight className="h-4 w-4 text-jarvis-secondary" />
        )}
      </button>

      {toolCall.expanded ? (
        <div className="space-y-3 border-t border-jarvis-border px-3 py-3 font-mono text-xs text-jarvis-secondary">
          <div>
            <div className="mb-1 text-[10px] uppercase tracking-[0.16em] text-jarvis-muted">Input</div>
            <pre className="max-h-48 overflow-auto rounded-md bg-jarvis-bg p-2 text-jarvis-text">{safeJson(toolCall.input)}</pre>
          </div>
          <div>
            <div className="mb-1 text-[10px] uppercase tracking-[0.16em] text-jarvis-muted">Result</div>
            <pre className="max-h-48 overflow-auto rounded-md bg-jarvis-bg p-2 text-jarvis-text">
              {toolCall.result ?? "Waiting for result..."}
            </pre>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function StatusIcon({ status }: { status: ToolCall["status"] }) {
  if (status === "running" || status === "pending") {
    return <Loader2 className="h-3.5 w-3.5 animate-spin text-jarvis-cyan" />;
  }
  if (status === "error") {
    return <X className="h-3.5 w-3.5 text-jarvis-error" />;
  }
  return <Check className="h-3.5 w-3.5 text-jarvis-success" />;
}
