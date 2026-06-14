"use client";

import { Check, Copy, Pencil, RefreshCw, ThumbsDown, ThumbsUp } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

interface Props {
  role: "user" | "assistant";
  content: string;
  onRegenerate?: () => void;
  onEdit?: () => void;
}

export function MessageActions({ role, content, onRegenerate, onEdit }: Props) {
  const [copied, setCopied] = useState(false);
  const [feedback, setFeedback] = useState<"up" | "down" | null>(null);
  const copy = async () => {
    await navigator.clipboard.writeText(content);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };
  const button = "flex h-8 w-8 items-center justify-center rounded-md border border-jarvis-border bg-transparent text-jarvis-secondary hover:bg-jarvis-elevated hover:text-jarvis-text transition shadow-sm";

  return (
    <div className="flex gap-1 opacity-0 transition group-hover:opacity-100">
      {role === "user" && (
        <button title="Edit" onClick={onEdit} className={button}>
          <Pencil size={15} />
        </button>
      )}
      <button title={copied ? "Copied!" : "Copy"} onClick={copy} className={button}>
        {copied ? <Check size={15} className="text-jarvis-success" /> : <Copy size={15} />}
      </button>
      {role === "assistant" && (
        <>
          <button title="Regenerate" onClick={onRegenerate} className={button}>
            <RefreshCw size={15} />
          </button>
          <button title="Good response" onClick={() => setFeedback("up")} className={cn(button, feedback === "up" && "text-jarvis-success")}>
            <ThumbsUp size={15} />
          </button>
          <button title="Bad response" onClick={() => setFeedback("down")} className={cn(button, feedback === "down" && "text-jarvis-error")}>
            <ThumbsDown size={15} />
          </button>
        </>
      )}
    </div>
  );
}
