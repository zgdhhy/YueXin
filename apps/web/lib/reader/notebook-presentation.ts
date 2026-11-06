import type { EditorState } from "@codemirror/state";
import { ensureSyntaxTree, syntaxTree } from "@codemirror/language";
import { literalCurrency, notebookBlocks } from "./notebook-markdown";

export type NotebookSpan = { from: number; to: number };
export type NotebookMark = NotebookSpan & { className: string; tagName?: string; attributes?: Record<string, string> };
export type NotebookLine = { from: number; classes: Set<string>; attributes: Record<string, string> };

/** Presentation only: the stored Markdown and the editor's selection never change. */
export function notebookPresentation(state: EditorState, focused: boolean) {
  const source = state.doc.toString();
  const blocks = notebookBlocks(source);
  const complex = blocks.filter(block => ["code", "table", "html", "hr"].includes(block.kind) || /^\s*\$\$/.test(block.source) || /!\[[^\]]*\]\(/.test(block.source));
  const selected = (from: number, to: number) => focused && state.selection.ranges.some(range => range.from <= to && range.to >= from);
  const insideComplex = (from: number, to: number) => complex.some(block => from >= block.from && to <= block.to);
  const lines = new Map<number, NotebookLine>();
  const lineStyle = (position: number) => {
    const line = state.doc.lineAt(position);
    if (!lines.has(line.from)) lines.set(line.from, { from: line.from, classes: new Set(), attributes: { "data-source-line": String(line.number) } });
    return lines.get(line.from)!;
  };
  for (let number = 1; number <= state.doc.lines; number++) {
    const line = state.doc.line(number), style = lineStyle(line.from);
    if (selected(line.from, line.to)) style.classes.add("notebook-line-editing");
    if (!line.text.trim() && !selected(line.from, line.to)) style.classes.add("notebook-blank-line");
  }
  const marks: NotebookMark[] = [], hidden: NotebookSpan[] = [], bullets: NotebookSpan[] = [];
  const math: (NotebookSpan & { source: string; active: boolean })[] = [];
  const code: NotebookSpan[] = [];
  const tree = ensureSyntaxTree(state, state.doc.length, 40) ?? syntaxTree(state);
  tree.iterate({ enter(node) { if (["InlineCode", "FencedCode", "CodeBlock", "URL"].includes(node.name)) code.push({ from: node.from, to: node.to }); } });
  // Dollar amounts remain ordinary text; only paired, non-code math is previewed.
  for (let cursor = 0; cursor < source.length;) {
    const from = source.indexOf("$", cursor);
    if (from < 0) break;
    cursor = from + 1;
    if (source[from - 1] === "\\" || source[from - 1] === "$" || source[from + 1] === "$") continue;
    if (insideComplex(from, from + 1) || code.some(span => from >= span.from && from < span.to)) continue;
    const end = source.indexOf("$", from + 1);
    if (end < 0 || source.slice(from + 1, end).includes("\n")) continue;
    const to = end + 1, body = source.slice(from + 1, end);
    if (!body || literalCurrency(body, source.slice(to)) || insideComplex(from, to) || code.some(span => from >= span.from && to <= span.to)) continue;
    math.push({ from, to, source: source.slice(from, to), active: selected(from, to) });
    cursor = to;
  }
  const marker = (from: number, to: number, reveal: boolean) => {
    if (to <= from) return;
    if (reveal) marks.push({ from, to, className: "notebook-syntax" });
    else hidden.push({ from, to });
  };
  tree.iterate({
    enter(node) {
      if (insideComplex(node.from, node.to) || math.some(span => node.from >= span.from && node.to <= span.to)) return false;
      const parent = node.node.parent;
      if (/^ATXHeading[1-6]$/.test(node.name)) {
        const level = node.name.slice(-1), style = lineStyle(node.from);
        style.classes.add(`notebook-heading-${level}`);
        style.attributes.role = "heading"; style.attributes["aria-level"] = level;
        style.attributes["aria-label"] = source.slice(node.from, node.to).replace(/^#+\s*/, "").replace(/[*_`~]/g, "");
      } else if (node.name === "Blockquote") {
        const last = state.doc.lineAt(node.to).number;
        for (let n = state.doc.lineAt(node.from).number; n <= last; n++) lineStyle(state.doc.line(n).from).classes.add("notebook-quote-line");
      } else if (node.name === "HeaderMark" || node.name === "QuoteMark") {
        const line = state.doc.lineAt(node.from);
        let to = node.to;
        while (to < line.to && /[ \t]/.test(source[to])) to++;
        marker(node.from, to, selected(line.from, line.to));
      } else if (node.name === "ListMark") {
        lineStyle(node.from).classes.add("notebook-list-line");
        const line = state.doc.lineAt(node.from);
        let textFrom = node.to;
        while (textFrom < line.to && /[ \t]/.test(source[textFrom])) textFrom++;
        if (textFrom < line.to) marks.push({ from: textFrom, to: line.to, className: "notebook-list-text" });
        if (/^\d+[.)]$/.test(source.slice(node.from, node.to))) marks.push({ from: node.from, to: node.to, className: "notebook-list-number" });
        else bullets.push({ from: node.from, to: node.to });
      } else if (["Emphasis", "StrongEmphasis", "Strikethrough", "InlineCode"].includes(node.name)) {
        const first = node.node.firstChild, last = node.node.lastChild;
        if (!first || !last || first.to >= last.from) return;
        const spec = node.name === "Emphasis" ? ["em", "notebook-emphasis"] : node.name === "StrongEmphasis" ? ["strong", "notebook-strong"] : node.name === "Strikethrough" ? ["s", "notebook-strike"] : ["code", "notebook-inline-code"];
        marks.push({ from: first.to, to: last.from, tagName: spec[0], className: spec[1] });
      } else if (["EmphasisMark", "StrikethroughMark", "CodeMark", "LinkMark"].includes(node.name) && parent) {
        marker(node.from, node.to, selected(parent.from, parent.to));
      } else if (node.name === "URL" && parent?.name === "Link") {
        marker(node.from, node.to, selected(parent.from, parent.to));
      } else if (node.name === "Link") {
        const open = node.node.firstChild;
        let labelEnd = -1;
        for (let child = open?.nextSibling; child; child = child.nextSibling) {
          if (child.name === "LinkMark" && source.slice(child.from, child.to) === "]") { labelEnd = child.from; break; }
        }
        if (open && labelEnd > open.to) marks.push({ from: open.to, to: labelEnd, className: "notebook-link" });
      } else if (node.name === "Escape") marker(node.from, node.from + 1, selected(node.from, node.to));
    },
  });
  for (const span of math.filter(span => span.active)) {
    marker(span.from, span.from + 1, true); marker(span.to - 1, span.to, true);
  }
  return { blocks, complex: complex.map(block => ({ ...block, active: selected(block.from, block.to) })), lines: [...lines.values()], marks, hidden, bullets, math };
}
