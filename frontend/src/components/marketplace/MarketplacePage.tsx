"use client";

import { Search } from "lucide-react";
import { useMemo, useState } from "react";
import { useRegistry } from "@/hooks/useRegistry";
import { cn } from "@/lib/utils";
import { useJarvisStore } from "@/store/useJarvisStore";
import type { RegistryKind } from "@/types/jarvis";
import { PluginCard } from "./PluginCard";

export function MarketplacePage() {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | RegistryKind>("all");
  const tools = useJarvisStore((state) => state.registry.tools);
  const agents = useJarvisStore((state) => state.registry.agents);
  const { addToStack } = useRegistry();
  const entries = useMemo(() => [...tools, ...agents], [agents, tools]);
  const filtered = useMemo(
    () => entries.filter((entry) => (filter === "all" || entry.type === filter) && `${entry.name} ${entry.description}`.toLowerCase().includes(query.toLowerCase())),
    [entries, filter, query]
  );

  return (
    <div className="h-full overflow-y-auto bg-jarvis-bg px-5 py-12 md:px-8">
      <div className="mx-auto max-w-7xl">
        <h1 className="text-3xl font-semibold">Marketplace</h1>
        <p className="mt-2 text-jarvis-secondary">Discover tools and agents to extend JARVIS</p>
        <label className="relative mt-8 block">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-jarvis-secondary" size={18} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} className="h-12 w-full rounded-lg border border-jarvis-border bg-jarvis-surface pl-11 pr-4 outline-none focus:border-jarvis-cyan" placeholder="Search marketplace..." />
        </label>
        <div className="mt-5 flex gap-2">
          {(["all", "tool", "agent"] as const).map((item) => (
            <button key={item} onClick={() => setFilter(item)} className={cn("rounded-lg border border-jarvis-border px-4 py-2 text-sm capitalize text-jarvis-secondary", filter === item && "border-jarvis-cyan bg-jarvis-elevated text-jarvis-cyan")}>
              {item === "all" ? "All" : `${item}s`}
            </button>
          ))}
        </div>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((entry) => <PluginCard key={`${entry.type}-${entry.name}`} entry={entry} onAdd={(name) => void addToStack(name)} />)}
        </div>
      </div>
    </div>
  );
}
