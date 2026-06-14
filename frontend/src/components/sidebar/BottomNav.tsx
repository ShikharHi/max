"use client";

import Link from "next/link";
import { Layers, Settings, ShoppingBag } from "lucide-react";
import { cn } from "@/lib/utils";

const items = [
  { href: "/marketplace", label: "Marketplace", icon: ShoppingBag },
  { href: "/stack", label: "My Stack", icon: Layers },
  { href: "#settings", label: "Settings", icon: Settings }
];

export function BottomNav({ collapsed }: { collapsed: boolean }) {
  return (
    <div className="mt-auto border-t border-jarvis-border p-2">
      {items.map((item) => {
        const Icon = item.icon;
        const className = cn(
          "mb-1 flex h-10 items-center gap-3 rounded-lg text-sm text-jarvis-secondary transition hover:bg-jarvis-elevated hover:text-jarvis-text",
          collapsed ? "w-full justify-center" : "px-3"
        );
        if (item.href.startsWith("#")) {
          return (
            <button key={item.label} title={item.label} className={className}>
              <Icon size={17} />
              {!collapsed && <span>{item.label}</span>}
            </button>
          );
        }
        return (
          <Link key={item.label} href={item.href} title={item.label} className={className}>
            <Icon size={17} />
            {!collapsed && <span>{item.label}</span>}
          </Link>
        );
      })}
    </div>
  );
}
