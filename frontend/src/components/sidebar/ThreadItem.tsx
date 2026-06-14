"use client";

import { MoreHorizontal } from "lucide-react";
import { relativeTime } from "@/lib/utils";
import type { Thread } from "@/types/jarvis";

export function ThreadItem({
  thread,
  active,
  onSelect,
  onRename,
  onDelete,
  menuOpen,
  onToggleMenu
}: {
  thread: Thread;
  active: boolean;
  onSelect: () => void;
  onRename: () => void;
  onDelete: () => void;
  menuOpen: boolean;
  onToggleMenu: () => void;
}) {
  return (
    <div className="group relative">
      {active && <div className="absolute left-0 top-2 h-8 w-0.5 rounded-full bg-jarvis-cyan" />}
      <button
        onClick={onSelect}
        className={`flex h-12 w-full items-center gap-3 rounded-lg px-3 pl-4 text-left transition hover:bg-jarvis-elevated ${active ? "bg-jarvis-elevated" : ""}`}
      >
        <span className={thread.status === "busy" ? "h-2 w-2 shrink-0 rounded-full bg-jarvis-cyan shadow-glow" : "h-2 w-2 shrink-0 rounded-full bg-jarvis-muted"} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm text-jarvis-text">{thread.title || "New conversation"}</span>
          <span className="block text-xs text-jarvis-secondary">{relativeTime(thread.updatedAt ?? thread.createdAt)}</span>
        </span>
      </button>
      <div className="absolute right-2 top-3">
        <button
          aria-label="Thread menu"
          onClick={(event) => {
            event.stopPropagation();
            onToggleMenu();
          }}
          className="hidden h-7 w-7 items-center justify-center rounded-md border border-jarvis-border bg-jarvis-surface text-jarvis-secondary hover:text-jarvis-cyan group-hover:flex"
        >
          <MoreHorizontal size={15} />
        </button>
        {menuOpen ? (
          <div className="absolute right-0 top-full z-10 mt-2 w-36 rounded-lg border border-jarvis-border bg-jarvis-surface p-1 shadow-lg">
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onRename();
              }}
              className="w-full rounded-md px-3 py-2 text-left text-sm text-jarvis-text transition hover:bg-jarvis-elevated"
            >
              Rename
            </button>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onDelete();
              }}
              className="w-full rounded-md px-3 py-2 text-left text-sm text-red-300 transition hover:bg-jarvis-elevated"
            >
              Delete
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
