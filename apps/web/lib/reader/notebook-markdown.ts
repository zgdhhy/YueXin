import { Node, getSchema } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { Markdown, MarkdownManager } from "@tiptap/markdown";
import { TableKit } from "@tiptap/extension-table";
import Image from "@tiptap/extension-image";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import { DOMSerializer } from "@tiptap/pm/model";
import katex from "katex";

// Keep math on the site's existing KaTeX version and preserve its Markdown source.
export function literalCurrency(body: string, rest = "") {
  return /^\d+(?:\.\d+)?(?:\/(?:任务|task|次|月|年|天|小时)|[，。；]|\s+(?:(?:and|to|per|each)\b|和|到))/.test(body) || /^\d/.test(body) && /^\d/.test(rest);
}
function mathNode(block: boolean) {
  const name = block ? "notebookBlockMath" : "notebookInlineMath";
  return Node.create({
    name, group: block ? "block" : "inline", inline: !block, atom: true,
    addAttributes: () => ({ latex: { default: "", parseHTML: el => el.getAttribute("data-latex") } }),
    parseHTML: () => [{ tag: `[data-note-math="${block ? "block" : "inline"}"]` }],
    renderHTML: ({ node }) => [block ? "div" : "span", { "data-note-math": block ? "block" : "inline", "data-latex": node.attrs.latex }],
    parseMarkdown: (token, helpers) => helpers.createNode(name, { latex: token.text ?? "" }),
    renderMarkdown: node => block ? `$$\n${node.attrs?.latex ?? ""}\n$$` : `$${node.attrs?.latex ?? ""}$`,
    markdownTokenizer: {
      name, level: block ? "block" : "inline", start: src => src.indexOf(block ? "$$" : "$"),
      tokenize: src => {
        const match = block ? /^\$\$\s*\n?([\s\S]*?)\n?\$\$(?:\n|$)/.exec(src) : /^\$(?!\$)([^$\n]+)\$/.exec(src);
        if (!block && match && literalCurrency(match[1], src.slice(match[0].length))) return undefined;
        return match ? { type: name, raw: match[0], text: match[1].trim() } : undefined;
      },
    },
  });
}

const notebookExtensions = [StarterKit.configure({ underline: false, link: { openOnClick: false } }), Markdown, TableKit, Image, TaskList, TaskItem.configure({ nested: true }), mathNode(true), mathNode(false)];

const previewSchema = getSchema(notebookExtensions);
const markdown = new MarkdownManager({ extensions: notebookExtensions });

export type NotebookBlock = { from: number; to: number; source: string; kind: string };

/** Keep each list item independently editable, while tables and code stay intact. */
export function notebookBlocks(source: string): NotebookBlock[] {
  const blocks: NotebookBlock[] = [];
  let offset = 0;
  for (const token of markdown.instance.lexer(source)) {
    const start = source.indexOf(token.raw, offset);
    if (start < 0) continue;
    offset = start + token.raw.length;
    if (token.type === "space" || !token.raw.trim()) continue;
    const items: { raw: string }[] = token.type === "list" ? token.items : [token];
    let itemOffset = start;
    for (const item of items) {
      const from = source.indexOf(item.raw, itemOffset);
      if (from < 0) continue;
      const text = item.raw.replace(/\n+$/, "");
      blocks.push({ from, to: from + text.length, source: text, kind: token.type });
      itemOffset = from + item.raw.length;
    }
  }
  return blocks;
}

export function renderNotebookBlock(source: string): HTMLDivElement {
  const preview = document.createElement("div");
  preview.className = "notebook-preview-block";
  const parsed = previewSchema.nodeFromJSON(markdown.parse(source));
  preview.append(DOMSerializer.fromSchema(previewSchema).serializeFragment(parsed.content));
  preview.querySelectorAll<HTMLElement>("[data-note-math]").forEach(el => {
    el.innerHTML = katex.renderToString(el.dataset.latex ?? "", { displayMode: el.dataset.noteMath === "block", throwOnError: false, trust: false });
  });
  return preview;
}

/** Match actual rendered text to source, skipping delimiters rather than estimating by width. */
export function notebookTextOffset(source: string, runs: readonly string[], target: number, offset: number): number {
  let cursor = 0;
  for (let i = 0; i <= target; i++) {
    const found = source.indexOf(runs[i], cursor);
    if (found < 0) continue;
    if (i === target) return found + Math.min(offset, runs[i].length);
    cursor = found + runs[i].length;
  }
  return cursor;
}
