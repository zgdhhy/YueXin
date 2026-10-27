import ReactMarkdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";

/** 把解读中的 figure://标签 替换为实际图片地址 */
export function resolveFigures(md: string, figures: { label: string; path: string }[]) {
  const byLabel = new Map(figures.map((f) => [f.label.toLowerCase(), f.path]));
  return md.replace(/\]\(figure:\/\/([^)]+)\)/g, (all, label: string) => {
    const path = byLabel.get(label.trim().toLowerCase());
    return path ? `](/files/${path.split("/").map(encodeURIComponent).join("/")})` : "](#)";
  });
}

/** 标题锚点：正文与目录使用同一规则 */
export function headingId(text: string) {
  return "h-" + text.trim().replace(/[\s:：,，、。（）()「」"'`]+/g, "-").replace(/-+$/, "");
}

export function extractToc(md: string) {
  return [...md.matchAll(/^##\s+(.+)$/gm)].map((m) => ({ text: m[1].trim(), id: headingId(m[1]) }));
}

function textOf(children: React.ReactNode): string {
  if (typeof children === "string" || typeof children === "number") return String(children);
  if (Array.isArray(children)) return children.map(textOf).join("");
  if (children && typeof children === "object" && "props" in children) {
    return textOf((children as { props: { children?: React.ReactNode } }).props.children);
  }
  return "";
}

export function Markdown({ source, className = "" }: { source: string; className?: string }) {
  return (
    <div className={`article prose prose-stone max-w-none ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={{
          h2: ({ children }) => <h2 id={headingId(textOf(children))}>{children}</h2>,
          img: ({ src, alt }) => (
            // 图片在 <p> 内，使用 span 保持合法嵌套
            <span className="not-prose my-8 block">
              <a href={typeof src === "string" ? src : undefined} target="_blank" className="block overflow-hidden rounded-xl bg-white p-3 ring-1 ring-stone-200 transition hover:ring-indigo-300">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={typeof src === "string" ? src : undefined} alt={alt ?? ""} className="mx-auto max-h-[520px] w-auto" loading="lazy" />
              </a>
              {alt && <span className="mt-2.5 block px-2 text-center text-sm leading-relaxed text-stone-500">{alt}</span>}
            </span>
          ),
          table: ({ children }) => (
            <div className="overflow-x-auto">
              <table>{children}</table>
            </div>
          ),
        }}
      >
        {source}
      </ReactMarkdown>
    </div>
  );
}
