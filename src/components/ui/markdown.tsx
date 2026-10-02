import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { clsx } from "clsx";

/**
 * Renders trusted content markdown. Raw HTML is not enabled.
 * Code blocks are keyboard-scrollable regions; `collapseCode` tucks them behind "Show code"
 * (used for learners who chose a non-technical background).
 */
export function Markdown({
  children,
  variant = "compact",
  className,
  collapseCode = false,
}: {
  children: string;
  variant?: "lesson" | "compact";
  className?: string;
  collapseCode?: boolean;
}) {
  return (
    <div className={clsx(variant === "lesson" ? "prose-lesson" : "prose-compact", "max-w-full min-w-0", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[[rehypeHighlight, { detect: false, ignoreMissing: true }]]}
        components={{
          a: ({ href, children: c }) => (
            <a href={href} target={href?.startsWith("http") ? "_blank" : undefined} rel="noreferrer">
              {c}
            </a>
          ),
          pre: ({ children: c }) => {
            const pre = (
              // Scrollable regions must be reachable by keyboard (axe: scrollable-region-focusable).
              <pre tabIndex={0} role="region" aria-label="Code sample" className="code-region">
                {c}
              </pre>
            );
            return collapseCode ? (
              <details className="code-details">
                <summary>Show code</summary>
                {pre}
              </details>
            ) : (
              pre
            );
          },
        }}
      >
        {children ?? ""}
      </ReactMarkdown>
    </div>
  );
}
