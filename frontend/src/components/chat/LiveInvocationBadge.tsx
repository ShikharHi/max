"use client";

import { AnimatePresence, motion } from "framer-motion";

export function LiveInvocationBadge({ label }: { label?: string | null }) {
  return (
    <AnimatePresence>
      {label && (
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.18 }}
          className="mb-2 inline-block rounded-full bg-jarvis-elevated/80 px-3 py-1 text-xs font-medium text-jarvis-cyan shadow-sm"
        >
          {label}
        </motion.div>
      )}
    </AnimatePresence>
  );
}