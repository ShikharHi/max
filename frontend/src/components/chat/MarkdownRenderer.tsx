"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";
import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";

function CodeBlock({ inline, className, children }: { inline?: boolean; className?: string; children?: React.ReactNode }) {
  const [copied, setCopied] = useState(false);
  const match = /language-(\w+)/.exec(className || "");
  const language = match?.[1] ?? "text";
  const text = String(children ?? "").replace(/\n$/, "");

  if (inline) {
    return <code className="rounded-md border border-jarvis-border bg-jarvis-elevated px-1 py-0.5 font-mono text-[0.9em] text-jarvis-cyan">{children}</code>;
  }

  const copy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="my-4 overflow-hidden rounded-lg border border-jarvis-border bg-[#0d0d14]">
      <div className="flex items-center justify-between border-b border-jarvis-border px-3 py-2 font-mono text-xs text-jarvis-secondary">
        <span>{language}</span>
        <button onClick={copy} className="flex h-7 items-center gap-1 rounded-md border border-jarvis-border px-2 hover:bg-jarvis-elevated">
          {copied ? <Check size={13} /> : <Copy size={13} />}
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>
      <pre className="overflow-x-auto p-4 text-sm leading-6">
        <code className={className}>{children}</code>
      </pre>
    </div>
  );
}

export function MarkdownRenderer({ content, streaming }: { content: string; streaming?: boolean }) {
  return (
    <div className="prose prose-invert max-w-none prose-p:my-3 prose-p:text-[15px] prose-p:leading-7 prose-li:my-1 prose-hr:border-jarvis-border">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={{
          h1: ({ className, ...props }) => <h1 className={cn("border-b border-jarvis-border pb-2 text-2xl text-jarvis-text", className)} {...props} />,
          h2: ({ className, ...props }) => <h2 className={cn("border-b border-jarvis-border pb-2 text-xl text-jarvis-text", className)} {...props} />,
          h3: ({ className, ...props }) => <h3 className={cn("text-lg text-jarvis-text", className)} {...props} />,
          a: ({ className, ...props }) => <a className={cn("text-jarvis-cyan underline-offset-4 hover:underline", className)} target="_blank" rel="noreferrer" {...props} />,
          blockquote: ({ className, ...props }) => <blockquote className={cn("border-l-[3px] border-jarvis-violet bg-jarvis-surface px-4 py-2 italic text-jarvis-secondary", className)} {...props} />,
          table: ({ className, ...props }) => <table className={cn("w-full overflow-hidden rounded-lg border border-jarvis-border text-sm", className)} {...props} />,
          th: ({ className, ...props }) => <th className={cn("border border-jarvis-border bg-jarvis-elevated px-3 py-2 text-left", className)} {...props} />,
          td: ({ className, ...props }) => <td className={cn("border border-jarvis-border px-3 py-2", className)} {...props} />,
          code: CodeBlock
        }}
      >
        {content || (streaming ? " " : "")}
      </ReactMarkdown>
      {streaming && content && <span className="ml-0.5 animate-cursor text-jarvis-cyan">|</span>}
    </div>
  );
}
