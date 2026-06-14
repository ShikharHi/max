"use client";

import { motion } from "framer-motion";

export function ThinkingIndicator() {
  return (
    <div className="space-y-3">
      <div className="flex gap-1.5">
        {[0, 1, 2].map((index) => (
          <motion.span
            key={index}
            className="h-2 w-2 rounded-full bg-jarvis-cyan"
            animate={{ opacity: [0.25, 1, 0.25] }}
            transition={{ duration: 1.1, repeat: Infinity, delay: index * 0.18, ease: "easeOut" }}
          />
        ))}
      </div>
      <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="text-xs text-jarvis-secondary">
        Deciding what to do...
      </motion.div>
    </div>
  );
}
