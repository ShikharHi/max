"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ChevronLeft, ChevronRight, Menu, Plus, Search } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { useJarvisStore } from "@/store/useJarvisStore";
import { BottomNav } from "./BottomNav";
import { ThreadList } from "./ThreadList";

export function Sidebar() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [query, setQuery] = useState("");
  const collapsed = useJarvisStore((state) => state.sidebarCollapsed);
  const setCollapsed = useJarvisStore((state) => state.setSidebarCollapsed);
  const setActiveThread = useJarvisStore((state) => state.setActiveThread);
  const setMessages = useJarvisStore((state) => state.setMessages);
  const router = useRouter();

  // New chat: clear active thread + message cache, navigate to root.
  // No thread is created or shown in the sidebar until the first message is sent.
  const handleNewChat = () => {
    setActiveThread(null);
    router.push("/");
  };

  const content = (
    <motion.aside
      initial={false}
      animate={{ width: collapsed ? 48 : 260 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className="relative flex h-full shrink-0 flex-col overflow-hidden border-r border-jarvis-border bg-jarvis-surface/95 backdrop-blur-xl"
    >
      <button
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        onClick={() => setCollapsed(!collapsed)}
        className="absolute right-1 top-3 z-10 flex h-7 w-7 items-center justify-center rounded-md border border-jarvis-border bg-jarvis-elevated text-jarvis-secondary hover:text-jarvis-cyan"
      >
        {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
      </button>

      <div className={cn("border-b border-jarvis-border px-3 py-5", collapsed && "px-2 text-center")}>
        <Link
          href="/"
          className={cn(
            "block font-mono text-xl font-bold text-jarvis-cyan",
            !collapsed && "drop-shadow-[0_0_12px_rgba(0,212,255,0.34)]"
          )}
        >
          {collapsed ? "J" : "JARVIS"}
        </Link>
        {!collapsed && <div className="mt-1 text-xs text-jarvis-muted">v1.0</div>}
      </div>

      <div className="space-y-3 p-2">
        <button
          onClick={handleNewChat}
          className={cn(
            "flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-jarvis-cyan/35 text-sm text-jarvis-text transition hover:bg-jarvis-elevated hover:shadow-glow",
            !collapsed && "justify-start px-3"
          )}
          title="New Chat"
        >
          <Plus size={18} />
          {!collapsed && <span>New Chat</span>}
        </button>

        {!collapsed && (
          <label className="relative block">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-jarvis-secondary" size={16} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search chats..."
              className="h-10 w-full rounded-lg border border-jarvis-border bg-jarvis-elevated pl-9 pr-3 text-sm text-jarvis-text outline-none transition focus:border-jarvis-cyan focus:shadow-focus"
            />
          </label>
        )}
      </div>

      <ThreadList query={query} collapsed={collapsed} />
      <BottomNav collapsed={collapsed} />
    </motion.aside>
  );

  return (
    <>
      <button
        aria-label="Open navigation"
        onClick={() => setMobileOpen(true)}
        className="fixed left-3 top-3 z-40 flex h-10 w-10 items-center justify-center rounded-lg border border-jarvis-border bg-jarvis-surface text-jarvis-text md:hidden"
      >
        <Menu size={18} />
      </button>
      <div className="hidden h-full md:block">{content}</div>
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            className="fixed inset-0 z-50 bg-black/60 md:hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              initial={{ x: -280 }}
              animate={{ x: 0 }}
              exit={{ x: -280 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
              className="h-full w-[280px]"
            >
              {content}
            </motion.div>
            <button
              className="absolute inset-0 left-[280px]"
              onClick={() => setMobileOpen(false)}
              aria-label="Close navigation"
            />
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}