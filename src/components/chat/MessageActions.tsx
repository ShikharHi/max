"use client";

import { Copy, Pencil, RefreshCw, ThumbsDown, ThumbsUp } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { FeedbackValue, Message } from "@/types/jarvis";

export function MessageActions({
  message,
  onEdit,
  onRegenerate,
  onFeedback
}: {
  message: Message;
  onEdit?: () => void;
  onRegenerate?: () => void | Promise<void>;
  onFeedback?: (feedback: FeedbackValue) => void;
}) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    await navigator.clipboard.writeText(message.content);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="mt-2 flex gap-1 opacity-0 transition-opacity duration-200 ease-out group-hover:opacity-100">
      {message.role === "user" ? (
        <Action label="Edit" onClick={onEdit}>
          <Pencil className="h-4 w-4" />
        </Action>
      ) : (
        <>
          <Action label="Regenerate" onClick={onRegenerate}>
            <RefreshCw className="h-4 w-4" />
          </Action>
          <Action
            label="Helpful"
            onClick={() => onFeedback?.(message.feedback === "up" ? null : "up")}
            active={message.feedback === "up"}
          >
            <ThumbsUp className="h-4 w-4" />
          </Action>
          <Action
            label="Not helpful"
            onClick={() => onFeedback?.(message.feedback === "down" ? null : "down")}
            active={message.feedback === "down"}
          >
            <ThumbsDown className="h-4 w-4" />
          </Action>
        </>
      )}

      <Action label={copied ? "Copied!" : "Copy"} onClick={copy}>
        <Copy className="h-4 w-4" />
      </Action>
    </div>
  );
}

function Action({
  label,
  active,
  children,
  onClick
}: {
  label: string;
  active?: boolean;
  children: React.ReactNode;
  onClick?: () => void | Promise<void>;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="iconSm"
          className={cn("h-8 w-8 border border-transparent hover:border-jarvis-border bg-transparent text-jarvis-secondary hover:bg-jarvis-elevated transition shadow-sm", active && "text-jarvis-cyan")}
          onClick={() => {
            void onClick?.();
          }}
          aria-label={label}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
