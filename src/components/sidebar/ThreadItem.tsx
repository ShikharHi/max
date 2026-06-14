"use client";

import { MoreHorizontal } from "lucide-react";
import type { Thread } from "@/types/jarvis";
import { Button } from "@/components/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger
} from "@/components/ui/context-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn, relativeTime } from "@/lib/utils";

export function ThreadItem({
  thread,
  title,
  active,
  collapsed,
  onClick,
  onRename,
  onDelete
}: {
  thread: Thread;
  title: string;
  active: boolean;
  collapsed: boolean;
  onClick: () => void;
  onRename: () => void;
  onDelete: () => void;
}) {
  const dot = (
    <span
      className={cn(
        "h-2 w-2 shrink-0 rounded-full",
        thread.status === "busy" ? "bg-jarvis-cyan shadow-cyan animate-pulse" : "bg-jarvis-muted"
      )}
    />
  );

  const item = (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group relative my-1 flex h-11 w-full items-center gap-2 rounded-lg px-2 text-left text-sm transition-colors duration-200 ease-out hover:bg-jarvis-elevated",
        active && "bg-jarvis-elevated",
        collapsed && "h-9 justify-center px-0"
      )}
      aria-label={title}
    >
      {active && !collapsed ? <span className="absolute left-0 top-2 h-7 w-0.5 rounded-full bg-jarvis-cyan" /> : null}
      {dot}
      {!collapsed ? (
        <>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-jarvis-text">{title}</span>
            <span className="block truncate text-xs text-jarvis-secondary">{relativeTime(thread.updated_at)}</span>
          </span>
          <span
            className="opacity-0 transition-opacity group-hover:opacity-100"
            onClick={(event) => event.stopPropagation()}
          >
            <Button
              variant="ghost"
              size="iconSm"
              className="h-7 w-7"
              aria-label="Thread actions"
              onClick={onRename}
            >
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </span>
        </>
      ) : null}
    </button>
  );

  const wrapped = (
    <ContextMenu>
      <ContextMenuTrigger asChild>{item}</ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onSelect={onRename}>Rename</ContextMenuItem>
        <ContextMenuItem onSelect={onDelete} className="text-red-300 focus:text-red-200">
          Delete
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );

  if (!collapsed) {
    return wrapped;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>{item}</TooltipTrigger>
      <TooltipContent side="right">{title}</TooltipContent>
    </Tooltip>
  );
}
