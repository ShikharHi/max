"use client";

import { Bot, Check, Plus, Wrench } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { RegistryEntry } from "@/types/jarvis";

export function PluginCard({ entry, onAdd }: { entry: RegistryEntry; onAdd: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const Icon = entry.kind === "agent" ? Bot : Wrench;

  return (
    <article className="flex min-h-56 flex-col rounded-lg border border-jarvis-border bg-jarvis-surface p-4 transition duration-200 ease-out hover:-translate-y-0.5 hover:border-jarvis-cyan">
      <div className="mb-4 flex items-start gap-3">
        <div
          className={cn(
            "flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-jarvis-elevated",
            entry.kind === "agent" ? "text-jarvis-cyan" : "text-jarvis-violet"
          )}
        >
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="truncate text-base font-semibold text-jarvis-text">{entry.display_name || entry.name}</h2>
            <span className="rounded border border-jarvis-border bg-jarvis-elevated px-1.5 py-0.5 font-mono text-[10px] text-jarvis-secondary">
              {entry.version}
            </span>
          </div>
          <p className="mt-1 font-mono text-xs text-jarvis-secondary">{entry.name}</p>
        </div>
      </div>

      <p className="line-clamp-2 min-h-10 text-sm leading-5 text-jarvis-secondary">{entry.description}</p>

      <div className="mt-4 flex flex-wrap gap-1.5">
        {entry.tags.slice(0, 4).map((tag) => (
          <span key={tag} className="rounded-full bg-jarvis-elevated px-2 py-1 text-[11px] text-jarvis-secondary">
            {tag}
          </span>
        ))}
      </div>

      <div className="mt-auto flex items-center justify-between gap-3 pt-5">
        <span
          className={cn(
            "rounded-full border px-2 py-1 text-xs capitalize",
            entry.kind === "agent"
              ? "border-jarvis-cyan/40 bg-jarvis-cyan/10 text-jarvis-cyan"
              : "border-jarvis-violet/40 bg-jarvis-violet/10 text-violet-200"
          )}
        >
          {entry.kind}
        </span>
        <Button
          variant="outline"
          size="sm"
          disabled={entry.active || busy}
          className={cn(entry.active && "border-jarvis-success/40 text-jarvis-success")}
          onClick={async () => {
            setBusy(true);
            try {
              await onAdd();
            } finally {
              setBusy(false);
            }
          }}
        >
          {entry.active ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          {entry.active ? "In Stack" : "Add to Stack"}
        </Button>
      </div>
    </article>
  );
}
