"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { EmptyState } from "@/components/chat/EmptyState";
import { InputBar } from "@/components/chat/InputBar";
import { MessageList } from "@/components/chat/MessageList";
import { useRun } from "@/hooks/useRun";
import { useJarvisStore } from "@/store/useJarvisStore";

export function ChatArea() {
  const params = useParams();
  const threadIdFromUrl = typeof params?.threadId === "string" ? params.threadId : null;
  const [draft, setDraft] = useState("");
  
  const setActiveThread = useJarvisStore((state) => state.setActiveThread);
  const setMessages = useJarvisStore((state) => state.setMessages);
  const activeThreadId = useJarvisStore((state) => state.threads.activeId);
  const messages = useJarvisStore((state) =>
    activeThreadId ? state.messages.byThreadId[activeThreadId] ?? [] : []
  );
  const { sendMessage, regenerateFromMessage, editAndRerun, stopRun, runState } = useRun();

  // Set active thread from URL on mount or when URL changes
  useEffect(() => {
    if (threadIdFromUrl) {
      console.debug("ChatArea: detected threadIdFromUrl=", threadIdFromUrl);
      setActiveThread(threadIdFromUrl);
      // Initialize empty messages array for new thread
      if (!useJarvisStore.getState().messages.byThreadId[threadIdFromUrl]) {
        setMessages(threadIdFromUrl, []);
      }
    }
  }, [threadIdFromUrl, setActiveThread, setMessages]);

  const empty = !activeThreadId || messages.length === 0;

  return (
    <section className="relative flex min-w-0 flex-1 flex-col bg-jarvis-bg/70">
      <div className="min-h-0 flex-1 overflow-hidden pb-36">
        {empty ? (
          <EmptyState onPickSuggestion={setDraft} />
        ) : (
          <MessageList
            messages={messages}
            onRegenerate={regenerateFromMessage}
            onEditAndRerun={editAndRerun}
          />
        )}
      </div>
      <InputBar
        draft={draft}
        onDraftChange={setDraft}
        onSend={async (content) => {
          setDraft("");
          await sendMessage(content);
        }}
        onStop={stopRun}
        running={runState.status === "running"}
      />
    </section>
  );
}
