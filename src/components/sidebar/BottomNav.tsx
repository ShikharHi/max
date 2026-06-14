"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Layers, Settings, ShoppingBag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const items = [
  { href: "/marketplace", label: "Marketplace", icon: ShoppingBag },
  { href: "/stack", label: "My Stack", icon: Layers },
  { href: "#settings", label: "Settings", icon: Settings }
];

export function BottomNav({ collapsed, onNavigate }: { collapsed: boolean; onNavigate: () => void }) {
  const pathname = usePathname();

  return (
    <div className="border-t border-jarvis-border p-2">
      <div className="space-y-1">
        {items.map((item) => {
          const Icon = item.icon;
          const active = pathname === item.href;
          const button = (
            <Button
              asChild={item.href !== "#settings"}
              variant="ghost"
              size={collapsed ? "icon" : "default"}
              className={cn(
                "w-full text-jarvis-secondary hover:text-jarvis-text",
                !collapsed && "justify-start",
                active && "bg-jarvis-elevated text-jarvis-cyan"
              )}
              onClick={onNavigate}
              aria-label={item.label}
            >
              {item.href === "#settings" ? (
                <>
                  <Icon className="h-4 w-4" />
                  {!collapsed ? <span>{item.label}</span> : null}
                </>
              ) : (
                <Link href={item.href}>
                  <Icon className="h-4 w-4" />
                  {!collapsed ? <span>{item.label}</span> : null}
                </Link>
              )}
            </Button>
          );

          if (!collapsed) {
            return <div key={item.label}>{button}</div>;
          }

          return (
            <Tooltip key={item.label}>
              <TooltipTrigger asChild>{button}</TooltipTrigger>
              <TooltipContent side="right">{item.label}</TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </div>
  );
}
