"use client";

import Link from "next/link";
import { Boxes, Loader2, RefreshCw } from "lucide-react";
import { useRegistry } from "@/hooks/useRegistry";
import { useJarvisStore } from "@/store/useJarvisStore";
import { StackCard } from "./StackCard";

export function StackPage() {
  const tools = useJarvisStore((state) => state.registry.tools);
  const agents = useJarvisStore((state) => state.registry.agents);
  const loading = useJarvisStore((state) => state.registry.isLoading);
  const { reload, toggle } = useRegistry();
  const empty = !tools.length && !agents.length;

  return (
    <div className="h-full overflow-y-auto bg-jarvis-bg px-5 py-12 md:px-8">
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold">My Stack</h1>
            <p className="mt-2 text-jarvis-secondary">Manage your active tools and agents</p>
          </div>
          <button onClick={() => void reload()} className="flex h-10 items-center gap-2 rounded-lg border border-jarvis-border px-4 text-sm text-jarvis-text hover:border-jarvis-cyan">
            {loading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
            Reload
          </button>
        </div>

        {empty ? (
          <div className="mt-24 flex flex-col items-center text-center">
            <Boxes size={42} className="text-jarvis-muted" />
            <p className="mt-4 text-jarvis-secondary">No plugins found. Add some from the Marketplace.</p>
            <Link href="/marketplace" className="mt-5 rounded-lg bg-jarvis-cyan px-4 py-2 text-sm font-medium text-jarvis-bg">Go to Marketplace</Link>
          </div>
        ) : (
          <div className="mt-10 space-y-10">
            <section>
              <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-jarvis-muted">Tools</h2>
              <div className="grid gap-3">{tools.map((entry) => <StackCard key={entry.name} entry={entry} onToggle={(name, active) => void toggle(name, active)} />)}</div>
            </section>
            <section>
              <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-jarvis-muted">Agents</h2>
              <div className="grid gap-3">{agents.map((entry) => <StackCard key={entry.name} entry={entry} onToggle={(name, active) => void toggle(name, active)} />)}</div>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
