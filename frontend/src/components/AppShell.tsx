"use client";

import { Sidebar } from "@/components/sidebar/Sidebar";
import { StepsPanel } from "@/components/steps/StepsPanel";
import { useRegistry } from "@/hooks/useRegistry";
import { useThreads } from "@/hooks/useThreads";
import { useJarvisStore } from "@/store/useJarvisStore";

export function AppShell({ children }: { children: React.ReactNode }) {
  useThreads(true);
  useRegistry(true);
  const connectionError = useJarvisStore((state) => state.connectionError);

  return (
    <main className="flex h-screen overflow-hidden bg-jarvis-bg text-jarvis-text">
      <Sidebar />
      <section className="relative min-w-0 flex-1">
        {connectionError && (
          <div className="absolute left-0 right-0 top-0 z-30 border-b border-jarvis-error/30 bg-jarvis-error/10 px-4 py-2 text-center text-sm text-jarvis-error">
            {connectionError}
          </div>
        )}
        {children}
        <StepsPanel />
      </section>
    </main>
  );
}
