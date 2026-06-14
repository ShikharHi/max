"use client";

import { Copy } from "lucide-react";
import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import remarkGfm from "remark-gfm";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function MarkdownRenderer({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[rehypeHighlight]}
      components={{
        h1: ({ className, ...props }) => (
          <h1
            className={cn(
              "mb-4 mt-6 border-b border-jarvis-border pb-2 text-2xl font-semibold text-jarvis-text",
              className
            )}
            {...props}
          />
        ),
        h2: ({ className, ...props }) => (
          <h2
            className={cn(
              "mb-3 mt-6 border-b border-jarvis-border pb-2 text-xl font-semibold text-jarvis-text",
              className
            )}
            {...props}
          />
        ),
        h3: ({ className, ...props }) => (
          <h3 className={cn("mb-2 mt-5 text-lg font-semibold text-jarvis-text", className)} {...props} />
        ),
        p: ({ className, ...props }) => (
          <p className={cn("mb-4 text-[15px] leading-7 text-jarvis-text", className)} {...props} />
        ),
        a: ({ className, ...props }) => (
          <a
            className={cn("text-jarvis-cyan underline-offset-4 hover:underline", className)}
            target="_blank"
            rel="noreferrer"
            {...props}
          />
        ),
        ul: ({ className, ...props }) => (
          <ul className={cn("mb-4 list-disc space-y-1 pl-6 text-[15px] leading-7", className)} {...props} />
        ),
        ol: ({ className, ...props }) => (
          <ol className={cn("mb-4 list-decimal space-y-1 pl-6 text-[15px] leading-7", className)} {...props} />
        ),
        blockquote: ({ className, ...props }) => (
          <blockquote
            className={cn(
              "mb-4 border-l-[3px] border-jarvis-violet bg-jarvis-surface px-4 py-2 text-[15px] italic text-jarvis-secondary",
              className
            )}
            {...props}
          />
        ),
        hr: ({ className, ...props }) => <hr className={cn("my-6 border-jarvis-border", className)} {...props} />,
        table: ({ className, ...props }) => (
          <div className="mb-4 overflow-x-auto rounded-lg border border-jarvis-border">
            <table className={cn("w-full border-collapse text-sm", className)} {...props} />
          </div>
        ),
        th: ({ className, ...props }) => (
          <th
            className={cn("border border-jarvis-border bg-jarvis-elevated px-3 py-2 text-left font-semibold", className)}
            {...props}
          />
        ),
        td: ({ className, ...props }) => (
          <td className={cn("border border-jarvis-border px-3 py-2 odd:bg-jarvis-surface", className)} {...props} />
        ),
        code: Code
      }}
    >
      {content}
    </ReactMarkdown>
  );
}

function Code({ inline, className, children, ...props }: any) {
  const [copied, setCopied] = useState(false);
  const raw = String(children).replace(/\n$/, "");
  const match = /language-(\w+)/.exec(className ?? "");
  const language = match?.[1] ?? "text";

  if (inline) {
    return (
      <code
        className={cn(
          "rounded-md border border-jarvis-border bg-jarvis-elevated px-1 py-0.5 font-mono text-[0.88em] text-jarvis-cyan",
          className
        )}
        {...props}
      >
        {children}
      </code>
    );
  }

  return (
    <div className="mb-4 overflow-hidden rounded-lg border border-jarvis-border bg-[#0d0d14]">
      <div className="flex h-9 items-center justify-between border-b border-jarvis-border px-3">
        <span className="font-mono text-xs text-jarvis-secondary">{language}</span>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs"
          onClick={async () => {
            await navigator.clipboard.writeText(raw);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1500);
          }}
        >
          <Copy className="h-3.5 w-3.5" />
          {copied ? "Copied!" : "Copy"}
        </Button>
      </div>
      <pre className="overflow-x-auto p-4 font-mono text-sm leading-6">
        <code className={className} {...props}>
          {children}
        </code>
      </pre>
    </div>
  );
}
