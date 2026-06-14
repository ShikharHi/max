"use client";

import { useRouter } from "next/navigation";
import { Loader2, Send, Square, Wrench } from "lucide-react";
import { KeyboardEvent, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useJarvisStore } from "@/store/useJarvisStore";

export function InputBar({
  draft,
  onDraftChange,
  onSend,
  onStop,
  running
}: {
  draft: string;
  onDraftChange: (value: string) => void;
  onSend: (value: string) => Promise<void>;
  onStop: () => Promise<void>;
  running: boolean;
}) {
  const router = useRouter();
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const registry = useJarvisStore((state) => state.registry);
  const active = [...registry.tools, ...registry.agents].filter((entry) => entry.active);
  const disabled = !draft.trim() || running;

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) {
      return;
    }

    textarea.style.height = "0px";
    const next = Math.min(textarea.scrollHeight, 24 * 6 + 20);
    textarea.style.height = `${Math.max(44, next)}px`;
  }, [draft]);

  const handleKeyDown = async (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      if (!disabled) {
        await onSend(draft);
      }
    }
  };

  return (
    <div className="absolute inset-x-0 bottom-4 z-20 pointer-events-none">
      <div className="mx-auto max-w-4xl px-4">
        <div className="pointer-events-auto overflow-hidden rounded-[32px] border border-white/10 bg-[#11131a]/90 p-4 shadow-2xl shadow-cyan-500/10 backdrop-blur-2xl">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-3xl border border-white/10 bg-white/5 text-jarvis-text/75">
              +
            </div>
            <textarea
              ref={textareaRef}
              value={draft}
              rows={1}
              onChange={(event) => onDraftChange(event.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Message JARVIS..."
              className="min-h-[48px] flex-1 resize-none rounded-3xl border border-transparent bg-transparent px-4 py-3 text-[15px] leading-6 text-jarvis-text outline-none transition-colors placeholder:text-jarvis-secondary focus:border-transparent focus:ring-0"
            />
            {running ? (
              <Button variant="danger" size="icon" aria-label="Stop run" onClick={onStop}>
                <Square className="h-4 w-4 fill-current" />
              </Button>
            ) : (
              <Button
                size="icon"
                aria-label="Send message"
                disabled={disabled}
                onClick={() => {
                  void onSend(draft);
                }}
              >
                {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
