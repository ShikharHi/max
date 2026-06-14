"use client";

import { Bot, ChevronDown, Check, Loader2, Wrench, X } from "lucide-react";
import { useState } from "react";
import { cn, stringifyPreview } from "@/lib/utils";
import type { ToolCall } from "@/types/jarvis";

export function ToolCallBlock({ call }: { call: ToolCall }) {
  const [open, setOpen] = useState(Boolean(call.expanded));
  const Icon = call.type === "agent" ? Bot : Wrench;
  const border = call.type === "agent" ? "border-l-jarvis-cyan" : "border-l-jarvis-violet";

  return (
    <div className={cn("mb-3 overflow-hidden rounded-lg border border-jarvis-border border-l-2 bg-[#0d0d14]", border)}>
      <button onClick={() => setOpen(!open)} className="flex w-full items-center gap-3 px-3 py-2 text-left">
        <Icon size={15} className={call.type === "agent" ? "text-jarvis-cyan" : "text-jarvis-violet"} />
        <span className="flex-1 font-mono text-xs text-jarvis-text">{call.name}</span>
        {call.status === "running" && <Loader2 size={14} className="animate-spin text-jarvis-cyan" />}
        {call.status === "done" && <Check size={14} className="text-jarvis-success" />}
        {call.status === "error" && <X size={14} className="text-jarvis-error" />}
        <ChevronDown size={15} className={cn("text-jarvis-secondary transition", open && "rotate-180")} />
      </button>
      {open && (
        <div className="space-y-3 border-t border-jarvis-border px-3 py-3 font-mono text-xs text-jarvis-secondary">
          <div>
            <div className="mb-1 text-jarvis-muted">Input</div>
            <pre className="overflow-x-auto whitespace-pre-wrap rounded-md bg-jarvis-surface p-2">{stringifyPreview(call.input ?? {})}</pre>
          </div>
          <div>
            <div className="mb-1 text-jarvis-muted">Result</div>
            <pre className="overflow-x-auto whitespace-pre-wrap rounded-md bg-jarvis-surface p-2">{stringifyPreview(call.result ?? "Pending")}</pre>
          </div>
        </div>
      )}
    </div>
  );
}
