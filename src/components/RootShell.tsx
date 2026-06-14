"use client";

import { Menu } from "lucide-react";
import type { ReactNode } from "react";
import { Sidebar } from "@/components/sidebar/Sidebar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useRegistry } from "@/hooks/useRegistry";
import { useThreads } from "@/hooks/useThreads";
import { useJarvisStore } from "@/store/useJarvisStore";

export function RootShell({ children }: { children: ReactNode }) {
  const { threads } = useThreads();
  useRegistry();

  const mobileSidebarOpen = useJarvisStore((state) => state.ui.mobileSidebarOpen);
  const setMobileSidebarOpen = useJarvisStore((state) => state.setMobileSidebarOpen);

  return (
    <TooltipProvider delayDuration={250}>
      <div className="jarvis-radial flex h-dvh overflow-hidden bg-jarvis-bg text-jarvis-text">
        <div className="hidden md:block">
          <Sidebar />
        </div>

        <Button
          variant="subtle"
          size="icon"
          className="fixed left-3 top-3 z-40 md:hidden"
          aria-label="Open navigation"
          onClick={() => setMobileSidebarOpen(true)}
        >
          <Menu className="h-4 w-4" />
        </Button>

        <Dialog open={mobileSidebarOpen} onOpenChange={setMobileSidebarOpen}>
          <DialogContent className="bottom-0 left-0 top-auto max-h-[88dvh] w-full max-w-none translate-x-0 translate-y-0 rounded-b-none rounded-t-lg border-x-0 border-b-0 p-0 sm:left-0 sm:max-w-none">
            <Sidebar mobile />
          </DialogContent>
        </Dialog>

        <main className="flex min-w-0 flex-1 flex-col">
          {threads.connectionError ? (
            <div className="border-b border-jarvis-error/40 bg-jarvis-error/10 px-4 py-2 text-center text-sm text-red-200">
              {threads.connectionError}
            </div>
          ) : null}
          <div className="min-h-0 flex-1">{children}</div>
        </main>
      </div>
    </TooltipProvider>
  );
}
