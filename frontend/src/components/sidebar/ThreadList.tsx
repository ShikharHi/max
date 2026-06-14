"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useThreads } from "@/hooks/useThreads";
import { useJarvisStore } from "@/store/useJarvisStore";
import { ThreadItem } from "./ThreadItem";

export function ThreadList({ query, collapsed }: { query: string; collapsed: boolean }) {
  const threads = useJarvisStore((state) => state.threads.list);
  const isLoading = useJarvisStore((state) => state.threads.isLoading);
  const activeId = useJarvisStore((state) => state.threads.activeId);
  const { selectThread, deleteThread, renameThread } = useThreads(true);
  const router = useRouter();
  const [renameThreadId, setRenameThreadId] = useState<string | null>(null);
  const [renameTitle, setRenameTitle] = useState("");
  const [deleteThreadId, setDeleteThreadId] = useState<string | null>(null);
  const [openMenuThreadId, setOpenMenuThreadId] = useState<string | null>(null);

  const openThread = (threadId: string) => {
    void selectThread(threadId).then(() => router.push(`/c/${threadId}`));
  };

  const filtered = useMemo(
    () => threads.filter((thread) => (thread.title ?? "New conversation").toLowerCase().includes(query.toLowerCase())),
    [query, threads]
  );

  const selectedRenameThread = renameThreadId ? threads.find((thread) => thread.id === renameThreadId) : null;
  const selectedDeleteThread = deleteThreadId ? threads.find((thread) => thread.id === deleteThreadId) : null;

  const requestRename = (threadId: string) => {
    const thread = threads.find((item) => item.id === threadId);
    setRenameThreadId(threadId);
    setRenameTitle(thread?.title ?? "");
  };

  const handleRenameSave = async () => {
    if (!renameThreadId) return;
    const title = renameTitle.trim();
    if (!title) return;
    await renameThread(renameThreadId, title);
    setRenameThreadId(null);
    setRenameTitle("");
  };

  const handleDeleteConfirm = async () => {
    if (!deleteThreadId) return;
    await deleteThread(deleteThreadId);
    setDeleteThreadId(null);
  };

  const closeRenameDialog = () => {
    setRenameThreadId(null);
    setRenameTitle("");
  };

  const closeDeleteDialog = () => setDeleteThreadId(null);

  if (collapsed) {
    return (
      <div className="flex flex-1 flex-col items-center gap-3 overflow-y-auto py-3">
        {filtered.map((thread) => (
          <button key={thread.id} title={thread.title ?? "New conversation"} onClick={() => openThread(thread.id)}>
            <span className={thread.status === "busy" ? "block h-2.5 w-2.5 rounded-full bg-jarvis-cyan shadow-glow" : "block h-2.5 w-2.5 rounded-full bg-jarvis-muted"} />
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className="min-h-0 flex-1 px-2">
      <div className="px-2 pb-2 text-[11px] font-semibold uppercase tracking-wider text-jarvis-muted">Recent</div>
      <div className="h-full space-y-1 overflow-y-auto pr-1">
        {filtered.map((thread) => (
          <ThreadItem
            key={thread.id}
            thread={thread}
            active={thread.id === activeId}
            onSelect={() => {
              setOpenMenuThreadId(null);
              openThread(thread.id);
            }}
            onRename={() => {
              setOpenMenuThreadId(null);
              requestRename(thread.id);
            }}
            onDelete={() => {
              setOpenMenuThreadId(null);
              setDeleteThreadId(thread.id);
            }}
            menuOpen={openMenuThreadId === thread.id}
            onToggleMenu={() => setOpenMenuThreadId((current) => (current === thread.id ? null : thread.id))}
          />
        ))}
        {!filtered.length && !isLoading && <div className="px-2 py-6 text-sm text-jarvis-secondary">No chats found.</div>}
        {!filtered.length && isLoading && <div className="px-2 py-6 text-sm text-jarvis-secondary">Loading chats...</div>}
      </div>

      {selectedRenameThread ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl border border-jarvis-border bg-jarvis-surface p-6 shadow-2xl">
            <div className="mb-3 text-lg font-semibold text-jarvis-text">Rename chat</div>
            <label className="mb-2 block text-sm font-medium text-jarvis-secondary">New title</label>
            <input
              value={renameTitle}
              onChange={(event) => setRenameTitle(event.target.value)}
              className="mb-4 w-full rounded-lg border border-jarvis-border bg-jarvis-background px-3 py-2 text-sm text-jarvis-text outline-none transition focus:border-jarvis-cyan"
              placeholder="Enter chat title"
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <button type="button" onClick={closeRenameDialog} className="rounded-lg px-4 py-2 text-sm text-jarvis-secondary hover:bg-jarvis-elevated">
                Cancel
              </button>
              <button
                type="button"
                onClick={handleRenameSave}
                className="rounded-lg bg-jarvis-cyan px-4 py-2 text-sm font-semibold text-black hover:opacity-90"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {selectedDeleteThread ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-2xl border border-jarvis-border bg-jarvis-surface p-6 shadow-2xl">
            <div className="mb-3 text-lg font-semibold text-jarvis-text">Delete chat</div>
            <p className="mb-4 text-sm text-jarvis-secondary">
              Are you sure you want to delete <span className="font-semibold text-jarvis-text">{selectedDeleteThread.title || "this conversation"}</span>?
            </p>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={closeDeleteDialog} className="rounded-lg px-4 py-2 text-sm text-jarvis-secondary hover:bg-jarvis-elevated">
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteConfirm}
                className="rounded-lg bg-red-500 px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
