"use client";

import { Bot, Wrench } from "lucide-react";
import { useState } from "react";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import type { RegistryEntry } from "@/types/jarvis";

export function StackCard({ entry, onToggle }: { entry: RegistryEntry; onToggle: (active: boolean) => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const Icon = entry.kind === "agent" ? Bot : Wrench;

  return (
    <article className="flex items-center gap-4 rounded-lg border border-jarvis-border bg-jarvis-surface p-4 transition-colors duration-200 ease-out hover:border-jarvis-cyan/40">
      <div
        className={cn(
          "flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-jarvis-elevated",
          entry.kind === "agent" ? "text-jarvis-violet" : "text-jarvis-cyan"
        )}
      >
        <Icon className="h-5 w-5" />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="truncate text-sm font-semibold text-jarvis-text">{entry.display_name || entry.name}</h3>
          <span className="font-mono text-xs text-jarvis-secondary">{entry.version}</span>
        </div>
        <p className="mt-1 truncate text-sm text-jarvis-secondary">{entry.description}</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {entry.tags.slice(0, 5).map((tag) => (
            <span key={tag} className="rounded-full bg-jarvis-elevated px-2 py-0.5 text-[11px] text-jarvis-secondary">
              {tag}
            </span>
          ))}
        </div>
      </div>

      <Switch
        checked={entry.active}
        disabled={busy}
        onCheckedChange={async (checked) => {
          setBusy(true);
          try {
            await onToggle(checked);
          } finally {
            setBusy(false);
          }
        }}
        aria-label={`${entry.active ? "Disable" : "Enable"} ${entry.name}`}
      />
    </article>
  );
}
