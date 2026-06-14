"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useJarvisStore } from "@/store/useJarvisStore";

export function ThinkingIndicator() {
  const statusText = useJarvisStore((state) => state.runState.statusText);

  return (
    <div className="rounded-lg border border-jarvis-border bg-jarvis-surface/70 px-4 py-3">
      <div className="flex items-center gap-1.5">
        {[0, 1, 2].map((index) => (
          <span
            key={index}
            className="h-2 w-2 rounded-full bg-jarvis-cyan animate-pulse-dot"
            style={{ animationDelay: `${index * 160}ms` }}
          />
        ))}
      </div>
      <AnimatePresence mode="wait">
        <motion.div
          key={statusText}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className="mt-2 text-xs text-jarvis-secondary"
        >
          {statusText}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
