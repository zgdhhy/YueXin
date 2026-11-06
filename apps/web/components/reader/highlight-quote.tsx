import katex from "katex";
import type { HighlightQuotePart } from "@/lib/reader/highlight-anchor";

export function HighlightQuote({ parts }: { parts: HighlightQuotePart[] }) {
  return <>{parts.map((part, index) => part.type === "text" ? part.value : <span key={index} className="highlight-quote-math" dangerouslySetInnerHTML={{ __html: katex.renderToString(part.value, { throwOnError: false, trust: false }) }}/>)}</>;
}
