"use client";

import * as ContextMenuPrimitive from "@radix-ui/react-context-menu";
import * as React from "react";
import { cn } from "@/lib/utils";

const ContextMenu = ContextMenuPrimitive.Root;
const ContextMenuTrigger = ContextMenuPrimitive.Trigger;
const ContextMenuPortal = ContextMenuPrimitive.Portal;

const ContextMenuContent = React.forwardRef<
  React.ElementRef<typeof ContextMenuPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.Content>
>(({ className, ...props }, ref) => (
  <ContextMenuPortal>
    <ContextMenuPrimitive.Content
      ref={ref}
      className={cn(
        "z-50 min-w-36 overflow-hidden rounded-lg border border-jarvis-border bg-jarvis-surface p-1 text-sm text-jarvis-text shadow-cyan-sm",
        className
      )}
      {...props}
    />
  </ContextMenuPortal>
));
ContextMenuContent.displayName = ContextMenuPrimitive.Content.displayName;

const ContextMenuItem = React.forwardRef<
  React.ElementRef<typeof ContextMenuPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.Item>
>(({ className, ...props }, ref) => (
  <ContextMenuPrimitive.Item
    ref={ref}
    className={cn(
      "relative flex cursor-default select-none items-center rounded-md px-2 py-1.5 text-sm outline-none transition-colors ease-out hover:bg-jarvis-elevated focus:bg-jarvis-elevated data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
      className
    )}
    {...props}
  />
));
ContextMenuItem.displayName = ContextMenuPrimitive.Item.displayName;

export { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger };
