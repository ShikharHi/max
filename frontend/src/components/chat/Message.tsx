"use client";

import { motion } from "framer-motion";
import { Check } from "lucide-react";
import { useState } from "react";
import { useRun } from "@/hooks/useRun";
import { cn } from "@/lib/utils";
import { useJarvisStore } from "@/store/useJarvisStore";
import type { Message as MessageType } from "@/types/jarvis";
import { MarkdownRenderer } from "./MarkdownRenderer";
import { MessageActions } from "./MessageActions";
import { ThinkingIndicator } from "./ThinkingIndicator";
import { LiveInvocationBadge } from "./LiveInvocationBadge";
import { TraceButton } from "./TraceButton";

export function Message({ message, previousUser }: { message: MessageType; previousUser?: string }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message.content);
  const activeId = useJarvisStore((state) => state.threads.activeId);
  const truncate = useJarvisStore((state) => state.truncateMessagesAfter);
  const update = useJarvisStore((state) => state.updateMessage);
  const runStepsCount = useJarvisStore((state) => state.runState.steps.length);
  const { sendMessage } = useRun();
  const isUser = message.role === "user";

  // Live invocation label (sentinel entries start with "__live__:")
  const liveUpdate = message.updates?.find((u) => u.startsWith("__live__:")) ?? null;
  const liveLabel = liveUpdate ? liveUpdate.slice("__live__:".length) : null;

  // Regular status updates (filter out the __live__ sentinel)
  const statusUpdates = message.updates?.filter((u) => !u.startsWith("__live__:")) ?? [];

  const confirmEdit = () => {
    if (!activeId) return;
    update(activeId, message.id, { content: draft });
    truncate(activeId, message.id);
    setEditing(false);
    void sendMessage(draft, activeId);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className={cn("group flex w-full", isUser ? "justify-end" : "justify-start")}
    >
      <div className={cn("flex max-w-[75%] gap-3", !isUser && "max-w-[88%]")}>
        {!isUser && <div className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded bg-jarvis-cyan font-mono text-[10px] font-bold text-jarvis-bg">J</div>}
        <div className="flex flex-col min-w-0">
          <div className={cn("relative overflow-hidden", isUser && "rounded-lg border border-jarvis-border bg-jarvis-elevated px-4 py-3 shadow-sm")}>
          {editing ? (
            <div className="flex gap-2">
              <textarea
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    confirmEdit();
                  }
                }}
                className="min-h-20 w-96 max-w-full rounded-lg border border-jarvis-border bg-jarvis-surface p-3 text-sm outline-none focus:border-jarvis-cyan"
              />
              <button onClick={confirmEdit} className="h-9 w-9 rounded-md bg-jarvis-cyan text-jarvis-bg">
                <Check size={16} className="mx-auto" />
              </button>
            </div>
          ) : isUser ? (
            <p className="whitespace-pre-wrap text-[15px] leading-7 text-jarvis-text">{message.content}</p>
          ) : (
            <>
              {/* Live tool/agent badge — disappears when the answer starts */}
              {liveLabel && !message.content && <LiveInvocationBadge label={liveLabel} />}

              {/* Regular status lines — shown while there's no answer content */}
              {statusUpdates.length > 0 && !message.content && (
                <div className="mb-2 space-y-1">
                  {statusUpdates.map((update, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs text-jarvis-secondary">
                      <span className="h-1 w-1 rounded-full bg-jarvis-muted" />
                      {update}
                    </div>
                  ))}
                </div>
              )}

              {!message.content && message.status === "streaming" ? <ThinkingIndicator /> : <MarkdownRenderer content={message.content} streaming={message.status === "streaming"} />}
            </>
          )}
          {!editing && isUser ? null : null}
          </div>
          {!editing && (
            <div className={cn("mt-2 flex items-center", isUser ? "justify-end" : "justify-start") + " opacity-0 transition-opacity duration-200 ease-out group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto"}>
              {(message.toolCalls?.length || runStepsCount) ? <TraceButton stepCount={message.toolCalls?.length} className="mr-2" /> : null}
              <MessageActions
                role={message.role}
                content={message.content}
                onEdit={() => setEditing(true)}
                onRegenerate={() => previousUser && activeId && void sendMessage(previousUser, activeId)}
              />
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
