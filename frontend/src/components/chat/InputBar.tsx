"use client";

import { Loader2, Send, Square } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef } from "react";
import { useRun } from "@/hooks/useRun";
import { useJarvisStore } from "@/store/useJarvisStore";

export function InputBar({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const { sendMessage, stop } = useRun();
  const activeId = useJarvisStore((state) => state.threads.activeId);
  const running = useJarvisStore((state) => state.runState.status === "running");
  const registryTools = useJarvisStore((state) => state.registry.tools);
  const registryAgents = useJarvisStore((state) => state.registry.agents);
  const tools = useMemo(
    () => [...registryTools, ...registryAgents].filter((entry) => entry.active),
    [registryAgents, registryTools]
  );

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 160)}px`;
  }, [value]);

  const submit = () => {
    if (!value.trim() || running) return;
    const next = value;
    onChange("");
    void sendMessage(next, activeId ?? undefined);
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
              value={value}
              onChange={(event) => onChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  submit();
                }
              }}
              rows={1}
              placeholder="Message JARVIS..."
              className="min-h-[48px] flex-1 resize-none rounded-3xl border border-transparent bg-transparent px-4 py-3 text-[15px] leading-6 text-jarvis-text outline-none transition placeholder:text-jarvis-muted focus:border-transparent focus:ring-0"
            />
            {running ? (
              <button onClick={() => void stop()} className="flex h-11 w-11 items-center justify-center rounded-3xl bg-jarvis-error text-white shadow-lg shadow-jarvis-error/20">
                <Square size={17} />
              </button>
            ) : (
              <button
                onClick={submit}
                disabled={!value.trim()}
                className="flex h-11 w-11 items-center justify-center rounded-3xl bg-jarvis-cyan text-jarvis-bg shadow-lg shadow-cyan-500/20 transition disabled:cursor-not-allowed disabled:opacity-40"
              >
                {running ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
