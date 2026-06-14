"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Message as MessageType } from "@/types/jarvis";
import { Message } from "./Message";

export function MessageList({ messages }: { messages: MessageType[] }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const [paused, setPaused] = useState(false);
  const previousUserById = useMemo(() => {
    const map = new Map<string, string>();
    let lastUser = "";
    for (const message of messages) {
      if (message.role === "user") lastUser = message.content;
      if (message.role === "assistant") map.set(message.id, lastUser);
    }
    return map;
  }, [messages]);

  useEffect(() => {
    if (!paused) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, paused]);

  return (
    <div
      ref={ref}
      onScroll={() => {
        const el = ref.current;
        if (!el) return;
        setPaused(el.scrollHeight - el.scrollTop - el.clientHeight > 120);
      }}
      className="relative h-full overflow-y-auto px-5 pb-8 pt-12 md:px-10"
    >
      <div className="mx-auto flex max-w-4xl flex-col gap-7">
        {messages.map((message) => (
          <Message key={message.id} message={message} previousUser={previousUserById.get(message.id)} />
        ))}
        <div ref={bottomRef} />
      </div>
      {paused && (
        <button
          onClick={() => {
            setPaused(false);
            bottomRef.current?.scrollIntoView({ behavior: "smooth" });
          }}
          className="fixed bottom-28 left-1/2 z-20 -translate-x-1/2 rounded-full bg-jarvis-cyan px-4 py-2 text-sm font-medium text-jarvis-bg shadow-glow"
        >
          ↓ Jump to bottom
        </button>
      )}
    </div>
  );
}
