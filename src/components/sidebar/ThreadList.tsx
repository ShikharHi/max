"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { useMemo } from "react";
import { ThreadItem } from "@/components/sidebar/ThreadItem";
import { useThreads } from "@/hooks/useThreads";
import { threadTitle } from "@/lib/utils";
import { useJarvisStore } from "@/store/useJarvisStore";

export function ThreadList({
  query,
  collapsed,
  onNavigate
}: {
  query: string;
  collapsed: boolean;
  onNavigate: () => void;
}) {
  const router = useRouter();
  const { threads, selectThread, renameThread, deleteThread } = useThreads(false);
  const messagesByThreadId = useJarvisStore((state) => state.messages.byThreadId);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) {
      return threads.list;
    }

    return threads.list.filter((thread) =>
      threadTitle(thread, messagesByThreadId[thread.thread_id]).toLowerCase().includes(needle)
    );
  }, [messagesByThreadId, query, threads.list]);

  return (
    <div className="min-h-0 flex-1 overflow-hidden border-t border-jarvis-border/50">
      {!collapsed ? (
        <div className="px-3 pb-2 pt-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-jarvis-muted">
          Recent
        </div>
      ) : null}

      <div className="h-full overflow-y-auto px-2 pb-3">
        <AnimatePresence initial={false}>
          {filtered.map((thread) => (
            <motion.div
              key={thread.thread_id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
            >
              <ThreadItem
                thread={thread}
                collapsed={collapsed}
                title={threadTitle(thread, messagesByThreadId[thread.thread_id])}
                active={threads.activeId === thread.thread_id}
                onClick={async () => {
                  console.debug("ThreadList: thread click", thread.thread_id);
                  await selectThread(thread.thread_id);
                  try {
                    router.push(`/c/${thread.thread_id}`);
                    console.debug("ThreadList: router.push called for /c/" + thread.thread_id);
                  } catch {
                    /* ignore */
                  }

                  if (typeof window !== "undefined") {
                    try {
                      window.history.replaceState(null, "", `/c/${thread.thread_id}`);
                      console.debug("ThreadList: window.history.replaceState set to /c/" + thread.thread_id);
                    } catch {
                      /* ignore */
                    }
                  }

                  onNavigate();
                }}
                onRename={() => {
                  const title = window.prompt("Rename thread", threadTitle(thread, messagesByThreadId[thread.thread_id]));
                  if (title?.trim()) {
                    await renameThread(thread.thread_id, title.trim());
                  }
                }}
                onDelete={async () => {
                  if (window.confirm("Delete this thread?")) {
                    await deleteThread(thread.thread_id);
                  }
                }}
              />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
