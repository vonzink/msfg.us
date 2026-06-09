import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * Tailwind-styled renderers for assistant chat Markdown, tuned for the chat
 * bubble: compact spacing, readable lists, safe links, GFM tables. Renders into
 * the emerald design system (spring markers, green links).
 *
 * SECURITY: no raw HTML is rendered — react-markdown escapes HTML by default and
 * we deliberately do NOT add `rehype-raw`, so untrusted model output (DeepSeek or
 * the Brain) can never inject markup/scripts into the page.
 */
const COMPONENTS: Components = {
  p: ({ children }) => <p className="mb-2 leading-relaxed last:mb-0">{children}</p>,
  strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  ul: ({ children }) => (
    <ul className="mb-2 list-disc space-y-1 pl-5 marker:text-spring last:mb-0">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="mb-2 list-decimal space-y-1 pl-5 marker:text-[#6b756d] last:mb-0">{children}</ol>
  ),
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="font-medium text-green-700 underline underline-offset-2 hover:text-green-800"
    >
      {children}
    </a>
  ),
  h1: ({ children }) => <p className="mb-1 mt-3 font-bold first:mt-0">{children}</p>,
  h2: ({ children }) => <p className="mb-1 mt-3 font-bold first:mt-0">{children}</p>,
  h3: ({ children }) => <p className="mb-1 mt-3 font-semibold first:mt-0">{children}</p>,
  h4: ({ children }) => <p className="mb-1 mt-2 font-semibold first:mt-0">{children}</p>,
  code: ({ children }) => (
    <code className="rounded bg-black/[0.06] px-1.5 py-0.5 font-mono text-[13px]">{children}</code>
  ),
  pre: ({ children }) => (
    <pre className="mb-2 overflow-x-auto rounded-md bg-black/[0.06] p-3 text-[13px] leading-snug last:mb-0">
      {children}
    </pre>
  ),
  blockquote: ({ children }) => (
    <blockquote className="my-2 border-l-2 border-spring/60 pl-3 text-[#5a6b61]">{children}</blockquote>
  ),
  hr: () => <hr className="my-3 border-line" />,
  table: ({ children }) => (
    <div className="mb-2 overflow-x-auto last:mb-0">
      <table className="w-full border-collapse text-[13.5px]">{children}</table>
    </div>
  ),
  th: ({ children }) => (
    <th className="border border-line bg-paper-2 px-2 py-1 text-left font-semibold">{children}</th>
  ),
  td: ({ children }) => <td className="border border-line px-2 py-1 align-top">{children}</td>,
};

/** Render assistant chat text as sanitized GitHub-flavored Markdown. */
export function ChatMarkdown({ children }: { children: string }) {
  return (
    <div className="text-[15px] leading-relaxed text-ink [overflow-wrap:anywhere]">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={COMPONENTS}>
        {children}
      </ReactMarkdown>
    </div>
  );
}
