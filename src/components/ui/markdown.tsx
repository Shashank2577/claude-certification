import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { clsx } from "clsx";

/** Renders trusted content markdown. Raw HTML is not enabled. */
export function Markdown({ children, variant = "compact", className }: { children: string; variant?: "lesson" | "compact"; className?: string }) {
  return (
    <div className={clsx(variant === "lesson" ? "prose-lesson" : "prose-compact", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[[rehypeHighlight, { detect: false, ignoreMissing: true }]]}
        components={{
          a: ({ href, children: c }) => (
            <a href={href} target={href?.startsWith("http") ? "_blank" : undefined} rel="noreferrer">
              {c}
            </a>
          ),
        }}
      >
        {children ?? ""}
      </ReactMarkdown>
    </div>
  );
}
