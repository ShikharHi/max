"use client";

import { Bot, Check, ChevronDown, Loader2, Wrench, X } from "lucide-react";
import { useState } from "react";
import { stringifyPreview } from "@/lib/utils";
import type { StepInvocation } from "@/types/jarvis";

export function InvocationRow({ invocation }: { invocation: StepInvocation }) {
  const [open, setOpen] = useState(false);
  const Icon = invocation.type === "agent" ? Bot : Wrench;
  return (
    <div className="rounded-lg border border-jarvis-border bg-jarvis-bg/50">
      <button onClick={() => setOpen(!open)} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm">
        <Icon size={14} className={invocation.type === "agent" ? "text-jarvis-violet" : "text-jarvis-cyan"} />
        <span className="min-w-0 flex-1 truncate font-mono text-xs">{invocation.name}</span>
        {invocation.status === "running" && <Loader2 size={13} className="animate-spin text-jarvis-cyan" />}
        {invocation.status === "done" && <Check size={13} className="text-jarvis-success" />}
        {invocation.status === "error" && <X size={13} className="text-jarvis-error" />}
        <ChevronDown size={14} className={open ? "rotate-180 text-jarvis-secondary" : "text-jarvis-secondary"} />
      </button>
      {open && (
        <div className="space-y-2 border-t border-jarvis-border p-3 font-mono text-[11px] text-jarvis-secondary">
          <pre className="overflow-x-auto whitespace-pre-wrap rounded bg-jarvis-surface p-2">{stringifyPreview(invocation.input ?? {})}</pre>
          <pre className="overflow-x-auto whitespace-pre-wrap rounded bg-jarvis-surface p-2">{stringifyPreview(invocation.result ?? "Pending")}</pre>
        </div>
      )}
    </div>
  );
}
