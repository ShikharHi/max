"use client";

import { Bot, Check, Cpu, Loader2, Route, X } from "lucide-react";
import { InvocationRow } from "@/components/steps/InvocationRow";
import { cn, formatElapsed, resultName } from "@/lib/utils";
import type { StepEvent } from "@/types/jarvis";

export function StepCard({ step }: { step: StepEvent }) {
  const isRouter = step.node === "router";

  return (
    <div className="rounded-lg border border-jarvis-border bg-jarvis-bg/70 p-3">
      <div className="mb-3 flex items-center gap-2">
        <span
          className={cn(
            "inline-flex h-5 items-center rounded px-2 text-[10px] font-semibold tracking-[0.12em] text-jarvis-bg",
            isRouter ? "bg-jarvis-cyan" : "bg-jarvis-violet text-white"
          )}
        >
          {isRouter ? "ROUTER" : "EXECUTOR"}
        </span>
        <span className="ml-auto font-mono text-[11px] text-jarvis-secondary">{formatElapsed(step.elapsedMs)}</span>
      </div>

      {isRouter ? <RouterBody step={step} /> : <ExecutorBody step={step} />}
    </div>
  );
}

function RouterBody({ step }: { step: StepEvent }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Route className="h-4 w-4 text-jarvis-cyan" />
        <span
          className={cn(
            "rounded-full border px-2 py-0.5 text-xs",
            step.decision === "answer" && "border-jarvis-success/40 bg-jarvis-success/10 text-jarvis-success",
            step.decision === "use_tools" && "border-jarvis-cyan/40 bg-jarvis-cyan/10 text-jarvis-cyan",
            step.decision === "use_agents" && "border-jarvis-violet/40 bg-jarvis-violet/10 text-violet-200"
          )}
        >
          {step.decision ?? "decision"}
        </span>
      </div>

      {step.plan ? <p className="text-xs italic leading-5 text-jarvis-secondary">{step.plan}</p> : null}

      {step.invocations?.length ? (
        <div className="space-y-2">
          {step.invocations.map((invocation, index) => (
            <InvocationRow
              key={`${invocation.name}-${index}`}
              icon={invocation.type === "agent" ? Bot : Cpu}
              name={invocation.name}
              kind={invocation.type === "agent" ? "agent" : "tool"}
              status="running"
              input={invocation.input ?? {}}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ExecutorBody({ step }: { step: StepEvent }) {
  const results = step.results ?? [];

  if (!results.length) {
    return (
      <div className="flex items-center gap-2 text-xs text-jarvis-secondary">
        <Loader2 className="h-4 w-4 animate-spin text-jarvis-cyan" />
        Waiting for executor output
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {results.map((result, index) => {
        const parsed = resultName(result);
        return (
          <InvocationRow
            key={`${parsed.name}-${index}`}
            icon={parsed.kind === "agent" ? Bot : Cpu}
            name={parsed.name}
            kind={parsed.kind}
            status={parsed.isError ? "error" : "done"}
            result={parsed.body}
            statusIcon={
              parsed.isError ? (
                <X className="h-3.5 w-3.5 text-jarvis-error" />
              ) : (
                <Check className="h-3.5 w-3.5 text-jarvis-success" />
              )
            }
          />
        );
      })}
    </div>
  );
}
