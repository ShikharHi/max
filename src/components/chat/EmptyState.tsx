"use client";

import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";

const suggestions = ["Search the web", "Manage my files", "Explain some code"];

export function EmptyState({ onPickSuggestion }: { onPickSuggestion: (value: string) => void }) {
  return (
    <div className="flex h-full items-center justify-center px-6">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2, ease: "easeOut" }}
        className="mx-auto flex max-w-2xl flex-col items-center text-center"
      >
        <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-lg border border-jarvis-cyan/30 bg-jarvis-elevated font-mono text-5xl font-semibold text-jarvis-cyan shadow-cyan">
          J
        </div>
        <h1 className="text-3xl font-semibold tracking-normal text-jarvis-text sm:text-4xl">
          What can I help you build?
        </h1>
        <p className="mt-3 text-sm text-jarvis-secondary sm:text-base">Ask anything. Use tools. Get results.</p>
        <div className="mt-7 flex flex-wrap justify-center gap-2">
          {suggestions.map((suggestion) => (
            <Button
              key={suggestion}
              variant="subtle"
              size="sm"
              className="rounded-full px-4"
              onClick={() => onPickSuggestion(suggestion)}
            >
              {suggestion}
            </Button>
          ))}
        </div>
      </motion.div>
    </div>
  );
}
