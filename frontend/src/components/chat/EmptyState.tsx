"use client";

const suggestions = ["Search the web", "Manage my files", "Explain some code"];

export function EmptyState({ onSuggestion }: { onSuggestion: (value: string) => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center px-6 text-center">
      <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-lg border border-jarvis-cyan/25 bg-jarvis-elevated font-mono text-5xl font-bold text-jarvis-cyan shadow-glow">
        J
      </div>
      <h1 className="text-3xl font-semibold tracking-normal text-jarvis-text">What can I help you build?</h1>
      <p className="mt-3 text-sm text-jarvis-secondary">Ask anything. Use tools. Get results.</p>
      <div className="mt-7 flex flex-wrap justify-center gap-3">
        {suggestions.map((suggestion) => (
          <button
            key={suggestion}
            onClick={() => onSuggestion(suggestion)}
            className="rounded-full border border-jarvis-border bg-jarvis-surface px-4 py-2 text-sm text-jarvis-text transition hover:border-jarvis-cyan/60 hover:bg-jarvis-elevated"
          >
            {suggestion}
          </button>
        ))}
      </div>
    </div>
  );
}
