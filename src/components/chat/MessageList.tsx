"use client";

import { AnimatePresence } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { Message } from "@/components/chat/Message";
import { Button } from "@/components/ui/button";
import type { Message as MessageType } from "@/types/jarvis";

export function MessageList({
  messages,
  onRegenerate,
  onEditAndRerun
}: {
  messages: MessageType[];
  onRegenerate: (threadId: string, assistantMessageId: string) => Promise<void>;
  onEditAndRerun: (threadId: string, userMessageId: string, content: string) => Promise<void>;
}) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const [lockedToBottom, setLockedToBottom] = useState(true);

  useEffect(() => {
    if (lockedToBottom) {
      bottomRef.current?.scrollIntoView({ block: "end" });
    }
  }, [messages, lockedToBottom]);

  return (
    <div className="relative h-full">
      <div
        ref={scrollRef}
        className="h-full overflow-y-auto px-4 py-8 md:px-8"
        onScroll={(event) => {
          const target = event.currentTarget;
          const distance = target.scrollHeight - target.scrollTop - target.clientHeight;
          setLockedToBottom(distance < 120);
        }}
      >
        <div className="mx-auto max-w-4xl space-y-7">
          <AnimatePresence initial={false}>
            {messages.map((message) => (
              <Message
                key={message.id}
                message={message}
                onRegenerate={onRegenerate}
                onEditAndRerun={onEditAndRerun}
              />
            ))}
          </AnimatePresence>
          <div ref={bottomRef} />
        </div>
      </div>

      {!lockedToBottom ? (
        <Button
          variant="subtle"
          size="sm"
          className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full border-jarvis-cyan/50 text-jarvis-cyan shadow-cyan-sm"
          onClick={() => {
            setLockedToBottom(true);
            bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
          }}
        >
          Down to bottom
        </Button>
      ) : null}
    </div>
  );
}
