"use client";

import { useState } from "react";
import { useJarvisStore } from "@/store/useJarvisStore";
import type { Message } from "@/types/jarvis";
import { EmptyState } from "./EmptyState";
import { InputBar } from "./InputBar";
import { MessageList } from "./MessageList";

const EMPTY_MESSAGES: Message[] = [];

export function ChatArea() {
  const [input, setInput] = useState("");
  const activeId = useJarvisStore((state) => state.threads.activeId);
  const byThreadId = useJarvisStore((state) => state.messages.byThreadId);
  const messages = activeId ? byThreadId[activeId] ?? EMPTY_MESSAGES : EMPTY_MESSAGES;

  return (
    <div className="relative flex h-full flex-col bg-[radial-gradient(circle_at_50%_0%,rgba(0,212,255,0.08),transparent_32%),#0a0a0f]">
      <div className="min-h-0 flex-1 pb-36">
        {messages.length ? <MessageList messages={messages} /> : <EmptyState onSuggestion={setInput} />}
      </div>
      <InputBar value={input} onChange={setInput} />
    </div>
  );
}
