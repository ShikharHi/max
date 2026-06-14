"use client";

import { motion } from "framer-motion";
import { Pin, PinOff, X } from "lucide-react";
import { useEffect, useState } from "react";
import { StepCard } from "@/components/steps/StepCard";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { formatElapsed } from "@/lib/utils";
import { useJarvisStore } from "@/store/useJarvisStore";

export function StepsPanel() {
  const [isMobile, setIsMobile] = useState(false);
  const runState = useJarvisStore((state) => state.runState);
  const stepsOpen = useJarvisStore((state) => state.ui.stepsOpen);
  const stepsPinned = useJarvisStore((state) => state.ui.stepsPinned);
  const setStepsOpen = useJarvisStore((state) => state.setStepsOpen);
  const setStepsPinned = useJarvisStore((state) => state.setStepsPinned);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 767px)");
    const update = () => setIsMobile(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  const content = (
    <div className="flex h-full min-h-0 flex-col bg-jarvis-surface">
      <div className="flex h-14 shrink-0 items-center gap-2 border-b border-jarvis-border px-4">
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-jarvis-text">Execution Trace</h2>
          <p className="text-xs text-jarvis-secondary">{runState.statusText}</p>
        </div>
        <Button
          variant="ghost"
          size="iconSm"
          aria-label={stepsPinned ? "Unpin trace" : "Pin trace"}
          onClick={() => setStepsPinned(!stepsPinned)}
          className={stepsPinned ? "text-jarvis-cyan" : ""}
        >
          {stepsPinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
        </Button>
        <Button variant="ghost" size="iconSm" aria-label="Close trace" onClick={() => setStepsOpen(false)}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {runState.steps.length ? (
          <div className="space-y-3">
            {runState.steps.map((step) => (
              <StepCard key={step.id} step={step} />
            ))}
          </div>
        ) : (
          <div className="flex h-full items-center justify-center text-center text-sm text-jarvis-secondary">
            Trace events will appear when a run starts.
          </div>
        )}
      </div>

      <div className="space-y-2 border-t border-jarvis-border p-4 text-xs text-jarvis-secondary">
        <div className="flex items-center justify-between">
          <span>Iteration {latestIteration(runState.steps)} of 8</span>
          <span>{formatElapsed(runState.elapsedMs)}</span>
        </div>
        {runState.status === "done" ? (
          <div className="rounded-md border border-jarvis-success/40 bg-jarvis-success/10 px-3 py-2 text-jarvis-success">
            Completed in {formatElapsed(runState.elapsedMs)}
          </div>
        ) : null}
        {runState.status === "error" ? (
          <div className="rounded-md border border-jarvis-error/40 bg-jarvis-error/10 px-3 py-2 text-red-200">
            {runState.error ?? "Error"}
          </div>
        ) : null}
      </div>
    </div>
  );

  return (
    <>
      <motion.aside
        initial={false}
        animate={{ width: stepsOpen ? 320 : 0, opacity: stepsOpen ? 1 : 0 }}
        transition={{ duration: 0.3, ease: "easeOut" }}
        className="hidden h-full shrink-0 overflow-hidden border-l border-jarvis-border md:block"
      >
        <div className="h-full w-80">{content}</div>
      </motion.aside>

      {isMobile ? (
        <Dialog open={stepsOpen} onOpenChange={setStepsOpen}>
          <DialogContent className="h-dvh max-h-dvh w-screen max-w-none rounded-none border-0 p-0">
            {content}
          </DialogContent>
        </Dialog>
      ) : null}
    </>
  );
}

function latestIteration(steps: { raw: unknown }[]) {
  for (const step of [...steps].reverse()) {
    const raw = step.raw;
    if (raw && typeof raw === "object" && "iterations" in raw) {
      const iterations = (raw as { iterations?: unknown }).iterations;
      if (typeof iterations === "number") {
        return iterations;
      }
    }
  }
  return steps.length ? 1 : 0;
}
