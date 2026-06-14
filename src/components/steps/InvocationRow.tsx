"use client";

import { ChevronDown, ChevronRight, Loader2, type LucideIcon } from "lucide-react";
import { ReactNode, useState } from "react";
import { cn, safeJson } from "@/lib/utils";

export function InvocationRow({
  icon: Icon,
  name,
  kind,
  status,
  input,
  result,
  statusIcon
}: {
  icon: LucideIcon;
  name: string;
  kind: "tool" | "agent";
  status: "running" | "done" | "error";
  input?: unknown;
  result?: string;
  statusIcon?: ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-md border border-jarvis-border bg-jarvis-surface">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 px-2 py-2 text-left"
      >
        <Icon className={cn("h-4 w-4", kind === "agent" ? "text-jarvis-cyan" : "text-jarvis-violet")} />
        <span className="min-w-0 flex-1 truncate font-mono text-xs text-jarvis-text">{name}</span>
        {statusIcon ?? <Loader2 className="h-3.5 w-3.5 animate-spin text-jarvis-cyan" />}
        {expanded ? (
          <ChevronDown className="h-3.5 w-3.5 text-jarvis-secondary" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-jarvis-secondary" />
        )}
      </button>

      {expanded ? (
        <div className="space-y-2 border-t border-jarvis-border p-2 font-mono text-[11px] text-jarvis-secondary">
          {input !== undefined ? (
            <div>
              <div className="mb-1 uppercase tracking-[0.14em] text-jarvis-muted">Input</div>
              <pre className="max-h-36 overflow-auto rounded bg-jarvis-bg p-2 text-jarvis-text">{safeJson(input)}</pre>
            </div>
          ) : null}
          {result !== undefined ? (
            <div>
              <div className="mb-1 uppercase tracking-[0.14em] text-jarvis-muted">Result</div>
              <pre className="max-h-36 overflow-auto rounded bg-jarvis-bg p-2 text-jarvis-text">{result}</pre>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
