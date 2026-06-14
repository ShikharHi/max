"use client";

import { useEffect } from "react";
import { useParams } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { ChatArea } from "@/components/chat/ChatArea";
import { useThreads } from "@/hooks/useThreads";

export default function ThreadPage() {
  const { threadId } = useParams() as { threadId?: string };
  const { selectThread } = useThreads(true);

  useEffect(() => {
    if (!threadId) return;
    void selectThread(threadId);
  }, [threadId, selectThread]);

  return (
    <AppShell>
      <ChatArea />
    </AppShell>
  );
}
