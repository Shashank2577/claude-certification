import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { clsx } from "clsx";
import { stripMarkdown } from "@/lib/speech-core";
import { SectionListen } from "@/components/section-listen";

/**
 * Renders trusted content markdown. Raw HTML is not enabled.
 * Code blocks are keyboard-scrollable regions; `collapseCode` tucks them behind "Show code"
 * (used for learners who chose a non-technical background).
 * `sectionListenId` prefixes a per-heading play button, so a learner can hear one section of a
 * long lesson instead of the whole thing.
 */
export function Markdown({
  children,
  variant = "compact",
  className,
  collapseCode = false,
  sectionListenId,
}: {
  children: string;
  variant?: "lesson" | "compact";
  className?: string;
  collapseCode?: boolean;
  sectionListenId?: string;
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
          ...(sectionListenId
            ? {
                h2: ({ children: c }: { children?: React.ReactNode }) => (
                  <h2 className="group/h2 flex items-start gap-2">
                    <span className="min-w-0">{c}</span>
                    <SectionListen id={sectionListenId} heading={headingText(c)} />
                  </h2>
                ),
                h3: ({ children: c }: { children?: React.ReactNode }) => (
                  <h3 className="group/h3 flex items-start gap-2">
                    <span className="min-w-0">{c}</span>
                    <SectionListen id={sectionListenId} heading={headingText(c)} />
                  </h3>
                ),
              }
            : {}),
        }}
      >
        {children ?? ""}
      </ReactMarkdown>
    </div>
  );
}

/** Headings are plain strings in the lesson bodies; anything else falls back to "this section". */
function headingText(node: React.ReactNode): string {
  const text = stripMarkdown(
    Array.isArray(node) ? node.map((n) => (typeof n === "string" ? n : Array.isArray(n) ? n.join("") : "")).join("") : String(node ?? ""),
  );
  return text || "this section";
}
