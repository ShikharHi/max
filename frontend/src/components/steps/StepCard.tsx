"use client";

import { cn } from "@/lib/utils";
import type { StepEvent } from "@/types/jarvis";
import { InvocationRow } from "./InvocationRow";

export function StepCard({ step }: { step: StepEvent }) {
  const isRouter = step.node === "router";

  const decisionStyles =
    step.decision === "answer"
      ? "bg-jarvis-success/15 text-jarvis-success"
      : step.decision === "use_agents"
        ? "bg-jarvis-violet/15 text-jarvis-violet"
        : "bg-jarvis-cyan/15 text-jarvis-cyan";

  return (
    <div className="rounded-lg border border-jarvis-border bg-jarvis-bg/60 p-3">
      {/* Header row */}
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <span
          className={cn(
            "rounded px-2 py-0.5 text-[10px] font-bold tracking-widest",
            isRouter
              ? "bg-jarvis-cyan/20 text-jarvis-cyan"
              : "bg-jarvis-violet/20 text-jarvis-violet"
          )}
        >
          {isRouter ? "ROUTER" : "EXECUTOR"}
        </span>
        <span className="font-mono text-[10px] text-jarvis-muted">{step.elapsedMs}ms</span>
      </div>

      {/* Decision badge */}
      {step.decision && (
        <span className={cn("mb-2 inline-block rounded-full px-2 py-0.5 text-[11px]", decisionStyles)}>
          {step.decision}
        </span>
      )}

      {/* Plan text */}
      {step.plan && (
        <p className="mb-2 text-xs italic leading-relaxed text-jarvis-secondary">{step.plan}</p>
      )}

      {/* Invocations */}
      {step.invocations && step.invocations.length > 0 ? (
        <div className="space-y-1.5">
          {step.invocations.map((invocation) => (
            <InvocationRow key={invocation.id} invocation={invocation} />
          ))}
        </div>
      ) : !isRouter ? (
        <p className="text-xs text-jarvis-muted">Executor update received.</p>
      ) : null}
    </div>
  );
}