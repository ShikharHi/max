"use client";

import { Search } from "lucide-react";
import { useMemo, useState } from "react";
import { PluginCard } from "@/components/marketplace/PluginCard";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useRegistry } from "@/hooks/useRegistry";
import type { RegistryKind } from "@/types/jarvis";

type Filter = "all" | RegistryKind;

export function MarketplacePage() {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const { registry, enablePlugin } = useRegistry(false);

  const entries = useMemo(() => {
    const all = [...registry.tools, ...registry.agents];
    const needle = query.trim().toLowerCase();

    return all.filter((entry) => {
      const matchesFilter = filter === "all" || entry.kind === filter;
      const haystack = `${entry.name} ${entry.display_name} ${entry.description} ${entry.tags.join(" ")}`.toLowerCase();
      return matchesFilter && (!needle || haystack.includes(needle));
    });
  }, [filter, query, registry.agents, registry.tools]);

  return (
    <section className="h-full overflow-y-auto bg-jarvis-bg/70 px-4 py-8 md:px-8">
      <div className="mx-auto max-w-7xl">
        <header className="mb-7">
          <h1 className="text-3xl font-semibold tracking-normal text-jarvis-text">Marketplace</h1>
          <p className="mt-2 text-sm text-jarvis-secondary">Discover tools and agents to extend JARVIS</p>
        </header>

        <div className="mb-6 flex flex-col gap-3 lg:flex-row lg:items-center">
          <label className="relative block min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-jarvis-secondary" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search marketplace..."
              className="h-10 w-full rounded-lg border border-jarvis-border bg-jarvis-elevated pl-9 pr-3 text-sm text-jarvis-text outline-none transition-colors placeholder:text-jarvis-secondary focus:border-jarvis-cyan focus:shadow-cyan-sm"
            />
          </label>

          <Tabs value={filter} onValueChange={(value) => setFilter(value as Filter)}>
            <TabsList>
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="tool">Tools</TabsTrigger>
              <TabsTrigger value="agent">Agents</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {entries.map((entry) => (
            <PluginCard key={`${entry.kind}-${entry.name}`} entry={entry} onAdd={() => enablePlugin(entry.name)} />
          ))}
        </div>
      </div>
    </section>
  );
}
