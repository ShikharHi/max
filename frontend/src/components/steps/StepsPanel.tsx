"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Activity, ChevronRight, Pin, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useJarvisStore } from "@/store/useJarvisStore";
import { StepCard } from "./StepCard";

export function StepsPanel() {
  const run = useJarvisStore((state) => state.runState);
  const setPanelOpen = useJarvisStore((state) => state.setPanelOpen);
  const setPinned = useJarvisStore((state) => state.setPinned);
  const seconds = (run.elapsedMs / 1000).toFixed(1);

  return (
    <AnimatePresence>
      {run.panelOpen && (
        <>
          {/* Backdrop — click to close on mobile */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={() => !run.pinned && setPanelOpen(false)}
            className="fixed inset-0 z-30 bg-black/40 backdrop-blur-sm lg:hidden"
          />

          {/* Drawer */}
          <motion.aside
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ duration: 0.28, ease: [0.32, 0.72, 0, 1] }}
            className="fixed right-0 top-0 z-40 flex h-full w-[340px] max-w-[90vw] flex-col border-l border-jarvis-border bg-jarvis-surface shadow-2xl lg:w-80"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-jarvis-border px-4 py-3">
              <div className="flex items-center gap-2">
                <Activity size={15} className="text-jarvis-cyan" />
                <h2 className="text-sm font-semibold tracking-tight">Execution Trace</h2>
                {run.steps.length > 0 && (
                  <span className="rounded-full bg-jarvis-violet/20 px-1.5 py-0.5 font-mono text-[10px] text-jarvis-violet">
                    {run.steps.length}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPinned(!run.pinned)}
                  title={run.pinned ? "Unpin panel" : "Pin panel"}
                  className={cn(
                    "flex h-7 w-7 items-center justify-center rounded-md border border-jarvis-border transition-colors hover:bg-jarvis-elevated",
                    run.pinned && "border-jarvis-cyan/40 bg-jarvis-cyan/10 text-jarvis-cyan"
                  )}
                >
                  <Pin size={13} />
                </button>
                <button
                  onClick={() => setPanelOpen(false)}
                  className="flex h-7 w-7 items-center justify-center rounded-md border border-jarvis-border transition-colors hover:bg-jarvis-elevated"
                >
                  <X size={13} />
                </button>
              </div>
            </div>

            {/* Steps */}
            <div className="min-h-0 flex-1 overflow-y-auto p-3">
              {run.steps.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
                  <ChevronRight size={28} className="text-jarvis-border" />
                  <p className="text-sm text-jarvis-secondary">No steps recorded yet.</p>
                  <p className="text-xs text-jarvis-muted">Steps appear here as the agent runs.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {run.steps.map((step) => (
                    <StepCard key={step.id} step={step} />
                  ))}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="shrink-0 border-t border-jarvis-border px-4 py-3">
              <div className="flex items-center justify-between text-xs text-jarvis-secondary">
                <span>{run.steps.length} step{run.steps.length !== 1 ? "s" : ""}</span>
                <span className="font-mono">{seconds}s</span>
              </div>
              {run.status === "done" && (
                <div className="mt-2 rounded-md border border-jarvis-success/25 bg-jarvis-success/8 px-2.5 py-1.5 text-xs text-jarvis-success">
                  Completed in {seconds}s
                </div>
              )}
              {run.status === "error" && (
                <div className="mt-2 rounded-md border border-jarvis-error/25 bg-jarvis-error/8 px-2.5 py-1.5 text-xs text-jarvis-error">
                  Run ended with error
                </div>
              )}
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}