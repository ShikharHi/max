"use client";

import { Bot, Wrench } from "lucide-react";
import { cn } from "@/lib/utils";
import type { RegistryEntry } from "@/types/jarvis";

export function StackCard({ entry, onToggle }: { entry: RegistryEntry; onToggle: (name: string, active: boolean) => void }) {
  const Icon = entry.type === "agent" ? Bot : Wrench;
  return (
    <article className="flex items-center gap-4 rounded-lg border border-jarvis-border bg-jarvis-surface p-4 transition hover:border-jarvis-cyan/40">
      <div className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-full", entry.type === "agent" ? "bg-jarvis-violet/15 text-jarvis-violet" : "bg-jarvis-cyan/15 text-jarvis-cyan")}>
        <Icon size={19} />
      </div>
      <div className="min-w-0 flex-1">
        <h3 className="truncate font-semibold">{entry.name}</h3>
        <p className="truncate text-sm text-jarvis-secondary">{entry.description}</p>
        <div className="mt-1 flex gap-2 text-xs text-jarvis-muted">
          <span>v{entry.version ?? "1.0.0"}</span>
          {(entry.tags ?? []).slice(0, 2).map((tag) => <span key={tag}>{tag}</span>)}
        </div>
      </div>
      <button
        onClick={() => onToggle(entry.name, !entry.active)}
        className={cn("relative h-6 w-11 rounded-full border transition", entry.active ? "border-jarvis-cyan bg-jarvis-cyan/25" : "border-jarvis-border bg-jarvis-elevated")}
        aria-label={`Toggle ${entry.name}`}
      >
        <span className={cn("absolute top-0.5 h-5 w-5 rounded-full bg-jarvis-secondary transition", entry.active ? "left-5 bg-jarvis-cyan" : "left-0.5")} />
      </button>
    </article>
  );
}
