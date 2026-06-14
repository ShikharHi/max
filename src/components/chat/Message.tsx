"use client";

import { motion } from "framer-motion";
import { Check, X } from "lucide-react";
import { useState } from "react";
import { MarkdownRenderer } from "@/components/chat/MarkdownRenderer";
import { MessageActions } from "@/components/chat/MessageActions";
import { ThinkingIndicator } from "@/components/chat/ThinkingIndicator";
import { ToolCallBlock } from "@/components/chat/ToolCallBlock";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useJarvisStore } from "@/store/useJarvisStore";
import type { Message as MessageType } from "@/types/jarvis";

export function Message({
  message,
  onRegenerate,
  onEditAndRerun
}: {
  message: MessageType;
  onRegenerate: (threadId: string, assistantMessageId: string) => Promise<void>;
  onEditAndRerun: (threadId: string, userMessageId: string, content: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(message.content);
  const setFeedback = useJarvisStore((state) => state.setFeedback);

  if (message.role === "user") {
    return (
      <motion.div
        layout
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -6 }}
        transition={{ duration: 0.2, ease: "easeOut" }}
        className="group flex justify-end"
      >
        <div className="max-w-[75%]">
          <div className="relative overflow-hidden rounded-lg border border-jarvis-border bg-jarvis-elevated px-4 py-3 text-[15px] leading-7 text-jarvis-text shadow-sm">
            {editing ? (
              <div className="space-y-2">
                <textarea
                  value={editValue}
                  autoFocus
                  rows={Math.min(6, Math.max(2, editValue.split("\n").length))}
                  onChange={(event) => setEditValue(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      setEditing(false);
                      void onEditAndRerun(message.threadId, message.id, editValue);
                    }
                  }}
                  className="w-full resize-none rounded-md border border-jarvis-border bg-jarvis-bg p-2 text-sm outline-none focus:border-jarvis-cyan"
                />
                <div className="flex justify-end gap-2">
                  <Button variant="ghost" size="iconSm" onClick={() => setEditing(false)} aria-label="Cancel edit">
                    <X className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="subtle"
                    size="iconSm"
                    onClick={() => {
                  </div>
                  {!editing ? (
                    <div className="mt-2 flex justify-end opacity-0 transition-opacity duration-200 ease-out group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto">
                      <MessageActions message={message} onEdit={() => setEditing(true)} />
                    </div>
                  ) : null}
                      setEditing(false);
                      void onEditAndRerun(message.threadId, message.id, editValue);
                    }}
                    aria-label="Confirm edit"
                  >
                    <Check className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ) : (
              message.content
            )}
          </div>
          {!editing ? (
            <div className="mt-2 flex justify-end opacity-0 transition-opacity duration-200 ease-out group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto">
              <MessageActions message={message} onEdit={() => setEditing(true)} />
            </div>
          ) : null}
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className="group flex items-start gap-3"
    >
      <div className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded bg-jarvis-cyan font-mono text-[10px] font-bold text-jarvis-bg">
        J
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-col">
        {message.toolCalls?.length ? (
          <div className="mb-4 space-y-2">
            {message.toolCalls.map((toolCall) => (
              <ToolCallBlock key={toolCall.id} message={message} toolCall={toolCall} />
            ))}
          </div>
        ) : null}

        {message.status === "thinking" && !message.content ? (
          <ThinkingIndicator />
        ) : (
          <div className={cn(message.status === "error" && "text-red-200")}>
            <MarkdownRenderer content={message.content || " "} />
            {message.status === "streaming" ? <span className="ml-1 animate-blink text-jarvis-cyan">|</span> : null}
          </div>
        )}

        {message.status === "complete" || message.status === "error" ? (
          <div className="mt-2 flex justify-start opacity-0 transition-opacity duration-200 ease-out group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto">
            <MessageActions
              message={message}
              onRegenerate={() => onRegenerate(message.threadId, message.id)}
              onFeedback={(feedback) => setFeedback(message.threadId, message.id, feedback)}
            />
          </div>
        ) : null}
        </div>
      </div>
    </motion.div>
  );
}
