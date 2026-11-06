import React from "react";
import ReactMarkdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import { remarkLiteralCurrency } from "../lib/markdown-currency";
import { remarkReadingFlow } from "../lib/markdown-reading-flow";

/** 把解读中的 figure://标签 替换为实际图片地址 */
export function resolveFigures(md: string, figures: { label: string; path: string }[]) {
  const byLabel = new Map(figures.map((f) => [f.label.toLowerCase(), f.path]));
  return md.replace(/\]\(figure:\/\/([^)]+)\)/g, (_, label: string) => {
    const path = byLabel.get(label.trim().toLowerCase());
    return path ? `](/files/${path.split("/").map(encodeURIComponent).join("/")})` : "](#)";
  });
}

/** 旧模板的开篇「一句话总结」与导语重复：页面上只保留其中的原图，原文不改（助手与视频仍读取完整内容）。 */
export function withoutLegacySummary(md: string) {
  const m = md.match(/^##[ \t]+一句话总结[ \t]*\r?\n([\s\S]*?)(?=^##[ \t])/m);
  if (!m || md.slice(0, m.index).trim()) return md;
  const figures = m[1].split(/\r?\n/).filter(line => /^!\[[^\]]*\]\([^)]*\)\s*$/.test(line.trim())).map(line => line.trim());
  return (figures.length ? figures.join("\n\n") + "\n\n" : "") + md.slice(m.index! + m[0].length);
}

/** 标题锚点：正文与目录使用同一规则 */
function headingId(text: string) {
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

export function Markdown({
  source,
  className = "",
  renderHeading,
  reading = false,
}: {
  source: string;
  className?: string;
  /** 自定义二级标题；默认输出带锚点的 h2 */
  renderHeading?: (h: { id: string; text: string; children: React.ReactNode }) => React.ReactNode;
  reading?: boolean;
}) {
  return (
    <div className={`article prose prose-stone max-w-none ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath, remarkLiteralCurrency, ...(reading ? [remarkReadingFlow] : [])]}
        rehypePlugins={[rehypeKatex]}
        components={{
          h2: ({ children }) => {
            const text = textOf(children).trim();
            return renderHeading ? renderHeading({ id: headingId(text), text, children }) : <h2 id={headingId(text)}>{children}</h2>;
          },
          img: ({ src, alt }) => (
            // 图片在 <p> 内，使用 span 保持合法嵌套
            <span className="article-figure not-prose my-8 block">
              <a href={typeof src === "string" ? src : undefined} target="_blank" data-lightbox className="block overflow-hidden rounded-xl bg-white p-3 ring-1 ring-stone-200 transition hover:ring-indigo-300">
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
