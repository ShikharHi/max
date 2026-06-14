"use client";

import { Bot, Check, Plus, Wrench } from "lucide-react";
import type { RegistryEntry } from "@/types/jarvis";

export function PluginCard({ entry, onAdd }: { entry: RegistryEntry; onAdd: (name: string) => void }) {
  const Icon = entry.type === "agent" ? Bot : Wrench;
  return (
    <article className="flex min-h-56 flex-col rounded-lg border border-jarvis-border bg-jarvis-surface p-4 transition hover:-translate-y-0.5 hover:border-jarvis-cyan">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-jarvis-elevated text-jarvis-cyan">
          {entry.icon ?? <Icon size={20} />}
        </div>
        <span className="rounded-full border border-jarvis-border px-2 py-1 font-mono text-[11px] text-jarvis-secondary">v{entry.version ?? "1.0.0"}</span>
      </div>
      <h3 className="font-semibold text-jarvis-text">{entry.name}</h3>
      <p className="mt-2 line-clamp-2 text-sm leading-6 text-jarvis-secondary">{entry.description}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {(entry.tags ?? []).slice(0, 3).map((tag) => <span key={tag} className="rounded-full bg-jarvis-elevated px-2 py-1 text-xs text-jarvis-secondary">{tag}</span>)}
      </div>
      <div className="mt-auto flex items-center justify-between pt-4">
        <span className={entry.type === "agent" ? "rounded bg-jarvis-violet/15 px-2 py-1 text-xs text-jarvis-violet" : "rounded bg-jarvis-cyan/15 px-2 py-1 text-xs text-jarvis-cyan"}>{entry.type}</span>
        <button
          disabled={entry.active}
          onClick={() => onAdd(entry.name)}
          className="flex h-9 items-center gap-2 rounded-lg border border-jarvis-cyan/60 px-3 text-sm text-jarvis-cyan disabled:border-jarvis-success/40 disabled:text-jarvis-success"
        >
          {entry.active ? <Check size={15} /> : <Plus size={15} />}
          {entry.active ? "In Stack" : "Add to Stack"}
        </button>
      </div>
    </article>
  );
}
