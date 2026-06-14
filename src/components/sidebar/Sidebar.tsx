"use client";

import { motion } from "framer-motion";
import { ChevronLeft, ChevronRight, Plus, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { BottomNav } from "@/components/sidebar/BottomNav";
import { ThreadList } from "@/components/sidebar/ThreadList";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useThreads } from "@/hooks/useThreads";
import { cn } from "@/lib/utils";
import { useJarvisStore } from "@/store/useJarvisStore";

export function Sidebar({ mobile = false }: { mobile?: boolean }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const collapsed = useJarvisStore((state) => state.ui.sidebarCollapsed);
  const setCollapsed = useJarvisStore((state) => state.setSidebarCollapsed);
  const setMobileSidebarOpen = useJarvisStore((state) => state.setMobileSidebarOpen);
  const { createThreadPending } = useThreads(false);

  const isCollapsed = mobile ? false : collapsed;
  const width = isCollapsed ? 48 : 260;

  const content = useMemo(
    () => (
      <div className="flex h-full min-h-0 flex-col overflow-hidden">
        <div className={cn("relative border-b border-jarvis-border px-3 py-4", isCollapsed && "px-2")}>
          {!mobile ? (
            <Button
              variant="ghost"
              size="iconSm"
              className="absolute right-1 top-2 text-jarvis-secondary"
              aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              onClick={() => setCollapsed(!isCollapsed)}
            >
              {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
            </Button>
          ) : null}

          <div className={cn("pr-8", isCollapsed && "flex justify-center pr-0")}>
            <div
              className={cn(
                "font-mono text-xl font-semibold tracking-normal text-jarvis-cyan",
                !isCollapsed && "drop-shadow-[0_0_12px_rgba(0,212,255,0.28)]"
              )}
            >
              {isCollapsed ? "J" : "JARVIS"}
            </div>
            {!isCollapsed ? <div className="mt-1 text-xs text-jarvis-muted">v1.0</div> : null}
          </div>
        </div>

        <div className={cn("space-y-3 px-3 py-3", isCollapsed && "px-2")}>
          <CollapsedTooltip label="New Chat" disabled={!isCollapsed}>
            <Button
              variant="outline"
              size={isCollapsed ? "icon" : "default"}
              className={cn(
                "border-jarvis-cyan/35 text-jarvis-text hover:border-jarvis-cyan/80",
                !isCollapsed && "w-full justify-start"
              )}
              aria-label="New Chat"
              onClick={async () => {
                const threadId = createThreadPending();
                console.debug("Sidebar: New Chat clicked, pending threadId=", threadId);
                // Try Next router navigation first
                try {
                  router.push(`/c/${threadId}`);
                  console.debug("Sidebar: router.push called for /c/" + threadId);
                } catch {
                  /* ignore */
                }

                // Fallback: ensure the browser URL reflects the thread id
                if (typeof window !== "undefined") {
                  try {
                    window.history.replaceState(null, "", `/c/${threadId}`);
                    console.debug("Sidebar: window.history.replaceState set to /c/" + threadId);
                  } catch {
                    // ignore
                  }
                }

                setMobileSidebarOpen(false);
              }}
            >
              <Plus className="h-4 w-4 text-jarvis-cyan" />
              {!isCollapsed ? <span>New Chat</span> : null}
            </Button>
          </CollapsedTooltip>

          {!isCollapsed ? (
            <label className="relative block">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-jarvis-secondary" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search chats..."
                className="h-9 w-full rounded-lg border border-jarvis-border bg-jarvis-elevated pl-9 pr-3 text-sm text-jarvis-text outline-none transition-colors placeholder:text-jarvis-secondary focus:border-jarvis-cyan focus:shadow-cyan-sm"
              />
            </label>
          ) : null}
        </div>

        <ThreadList query={query} collapsed={isCollapsed} onNavigate={() => setMobileSidebarOpen(false)} />
        <BottomNav collapsed={isCollapsed} onNavigate={() => setMobileSidebarOpen(false)} />
      </div>
    ),
    [createThreadPending, isCollapsed, mobile, query, router, setCollapsed, setMobileSidebarOpen]
  );

  if (mobile) {
    return <aside className="h-[88dvh] w-full bg-jarvis-surface">{content}</aside>;
  }

  return (
    <motion.aside
      initial={false}
      animate={{ width }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className="h-dvh shrink-0 border-r border-jarvis-border bg-jarvis-surface/95 backdrop-blur-xl"
    >
      {content}
    </motion.aside>
  );
}

function CollapsedTooltip({
  label,
  disabled,
  children
}: {
  label: string;
  disabled: boolean;
  children: React.ReactNode;
}) {
  if (!disabled) {
    return children;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}
