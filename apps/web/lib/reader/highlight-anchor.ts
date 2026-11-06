export type TextAnchor = { quote: string; start: number; prefix: string; suffix: string };
export type HighlightQuotePart = { type: "text" | "math"; value: string };

/** Stored offsets include KaTeX's hidden MathML/source; presentation must not. */
export function highlightQuote(root: HTMLElement, anchor: TextAnchor): HighlightQuotePart[] {
  const range = highlightRange(root, anchor);
  if (!range) return [{ type: "text", value: anchor.quote }];
  const parts: HighlightQuotePart[] = [], seen = new Set<Element>();
  for (const { node, text } of selectedText(root, range)) {
    const math = node.parentElement?.closest(".katex");
    if (math) {
      if (seen.has(math)) continue;
      seen.add(math);
      const latex = math.querySelector('annotation[encoding="application/x-tex"]')?.textContent;
      parts.push({ type: latex ? "math" : "text", value: latex ?? math.querySelector(".katex-html")?.textContent ?? text });
    } else {
      const last = parts[parts.length - 1];
      if (last?.type === "text") last.value += text;
      else parts.push({ type: "text", value: text });
    }
  }
  return parts;
}

/** Only actual selected text nodes, without the duplicate element rectangles. */
export function selectedText(root: HTMLElement, range: Range): { node: Text; text: string; range: Range }[] {
  const result: { node: Text; text: string; range: Range }[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    if (!range.intersectsNode(node)) continue;
    const start = node === range.startContainer ? range.startOffset : 0;
    const end = node === range.endContainer ? range.endOffset : node.length;
    if (end <= start) continue;
    const piece = document.createRange(); piece.setStart(node, start); piece.setEnd(node, end);
    result.push({ node, text: node.data.slice(start, end), range: piece });
  }
  return result;
}

/** Prefer the saved occurrence; use surrounding text if a published revision shifts it. */
export function locateHighlight(text: string, anchor: TextAnchor): number {
  if (!anchor.quote) return -1;
  if (text.slice(anchor.start, anchor.start + anchor.quote.length) === anchor.quote && (!anchor.prefix || text.slice(Math.max(0, anchor.start - anchor.prefix.length), anchor.start) === anchor.prefix) && (!anchor.suffix || text.slice(anchor.start + anchor.quote.length, anchor.start + anchor.quote.length + anchor.suffix.length) === anchor.suffix)) return anchor.start;
  let best = -1, score = -Infinity;
  for (let at = text.indexOf(anchor.quote); anchor.quote && at !== -1; at = text.indexOf(anchor.quote, at + 1)) {
    const context = Number(!!anchor.prefix && text.slice(Math.max(0, at - anchor.prefix.length), at) === anchor.prefix) + Number(!!anchor.suffix && text.slice(at + anchor.quote.length, at + anchor.quote.length + anchor.suffix.length) === anchor.suffix);
    const candidate = context * (text.length + 1) - Math.abs(at - anchor.start);
    if (candidate > score) { best = at; score = candidate; }
  }
  return best;
}

export function highlightRange(root: HTMLElement, anchor: TextAnchor): Range | null {
  const start = locateHighlight(root.textContent ?? "", anchor);
  if (start < 0) return null;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  let offset = 0, found = false;
  while (walker.nextNode()) {
    const node = walker.currentNode;
    const end = offset + (node.textContent?.length ?? 0);
    if (!found && start >= offset && start < end) { range.setStart(node, start - offset); found = true; }
    if (found && start + anchor.quote.length <= end) { range.setEnd(node, start + anchor.quote.length - offset); return range; }
    offset = end;
  }
  return null;
}

export function selectionAnchor(root: HTMLElement, selection: Selection): TextAnchor | null {
  if (!selection.rangeCount || selection.isCollapsed) return null;
  const range = selection.getRangeAt(0);
  if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) return null;
  const before = range.cloneRange();
  before.selectNodeContents(root); before.setEnd(range.startContainer, range.startOffset);
  const text = root.textContent ?? "", raw = range.toString();
  const quote = raw.trim();
  if (!quote || quote.length > 5000) return null;
  const start = before.toString().length + raw.indexOf(quote);
  return { quote, start, prefix: text.slice(Math.max(0, start - 40), start), suffix: text.slice(start + quote.length, start + quote.length + 40) };
}
