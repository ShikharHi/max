"use client";

import { Loader2, RefreshCw, ShoppingBag } from "lucide-react";
import { useRouter } from "next/navigation";
import { StackCard } from "@/components/stack/StackCard";
import { Button } from "@/components/ui/button";
import { useRegistry } from "@/hooks/useRegistry";

export function StackPage() {
  const router = useRouter();
  const { registry, reloadRegistry, enablePlugin, disablePlugin } = useRegistry(false);
  const tools = registry.tools;
  const agents = registry.agents;
  const empty = !tools.length && !agents.length;

  return (
    <section className="h-full overflow-y-auto bg-jarvis-bg/70 px-4 py-8 md:px-8">
      <div className="mx-auto max-w-6xl">
        <header className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-normal text-jarvis-text">My Stack</h1>
            <p className="mt-2 text-sm text-jarvis-secondary">Manage your active tools and agents</p>
          </div>
          <Button variant="subtle" onClick={reloadRegistry} disabled={registry.isLoading}>
            {registry.isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Reload
          </Button>
        </header>

        {empty ? (
          <div className="flex min-h-[50vh] flex-col items-center justify-center text-center">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-lg border border-jarvis-border bg-jarvis-surface text-jarvis-cyan">
              <ShoppingBag className="h-6 w-6" />
            </div>
            <h2 className="text-lg font-semibold text-jarvis-text">No plugins found. Add some from the Marketplace.</h2>
            <Button className="mt-4" onClick={() => router.push("/marketplace")}>
              Go to Marketplace
            </Button>
          </div>
        ) : (
          <div className="space-y-8">
            <StackSection
              title="Tools"
              entries={tools}
              onEnable={enablePlugin}
              onDisable={disablePlugin}
            />
            <StackSection
              title="Agents"
              entries={agents}
              onEnable={enablePlugin}
              onDisable={disablePlugin}
            />
          </div>
        )}
      </div>
    </section>
  );
}

function StackSection({
  title,
  entries,
  onEnable,
  onDisable
}: {
  title: string;
  entries: ReturnType<typeof useRegistry>["registry"]["tools"];
  onEnable: (name: string) => Promise<void>;
  onDisable: (name: string) => Promise<void>;
}) {
  if (!entries.length) {
    return null;
  }

  return (
    <section>
      <div className="mb-3 flex items-center gap-3">
        <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-jarvis-muted">{title}</h2>
        <div className="h-px flex-1 bg-jarvis-border" />
      </div>
      <div className="grid gap-3">
        {entries.map((entry) => (
          <StackCard
            key={`${entry.kind}-${entry.name}`}
            entry={entry}
            onToggle={(active) => (active ? onEnable(entry.name) : onDisable(entry.name))}
          />
        ))}
      </div>
    </section>
  );
}
