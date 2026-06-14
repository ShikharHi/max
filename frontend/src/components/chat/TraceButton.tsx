"use client";

import { Activity } from "lucide-react";
import { cn } from "@/lib/utils";
import { useJarvisStore } from "@/store/useJarvisStore";

interface TraceButtonProps {
    /** Pass the steps snapshot for this specific message so the panel can be
     *  scoped to that run. For now we just open the global panel. */
    stepCount?: number;
    className?: string;
}

/**
 * Small icon button rendered in the assistant message action-bar (same row as
 * the copy button). Clicking it slides open the Execution Trace panel.
 *
 * Usage — drop this inside your existing message action row:
 *
 *   <TraceButton stepCount={message.toolCalls?.length} />
 */
export function TraceButton({ stepCount, className }: TraceButtonProps) {
    const panelOpen = useJarvisStore((state) => state.runState.panelOpen);
    const setPanelOpen = useJarvisStore((state) => state.setPanelOpen);
    const runStepsCount = useJarvisStore((state) => state.runState.steps.length);
    const count = stepCount ?? runStepsCount;

    // Only render if there are actually steps to show
    if (count === 0) return null;

    return (
        <button
            onClick={() => setPanelOpen(!panelOpen)}
            title="View execution trace"
            className={cn(
                "group flex items-center gap-1 rounded-md px-1.5 py-1 text-jarvis-muted transition-colors hover:bg-jarvis-elevated hover:text-jarvis-cyan",
                panelOpen && "bg-jarvis-cyan/10 text-jarvis-cyan",
                className
            )}
        >
            <Activity size={13} />
            <span className="font-mono text-[10px] tabular-nums">{stepCount}</span>
        </button>
    );
}