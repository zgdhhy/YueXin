"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { Compartment, EditorSelection, EditorState, StateEffect, StateField, Transaction, type Range } from "@codemirror/state";
import { Decoration, EditorView, WidgetType, keymap, placeholder, type DecorationSet } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, redo } from "@codemirror/commands";
import { deleteMarkupBackward, insertNewlineContinueMarkupCommand, markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { notebookTextOffset, renderNotebookBlock } from "@/lib/reader/notebook-markdown";

import { notebookPresentation } from "@/lib/reader/notebook-presentation";

const focusPreview = StateEffect.define<boolean>();
const editable = new Compartment();
const previewSources = new WeakMap<HTMLElement, string>();

class MarkdownPreview extends WidgetType {
  constructor(readonly source: string, readonly from: number) { super(); }
  eq(other: MarkdownPreview) { return this.source === other.source && this.from === other.from; }
  toDOM() {
    const dom = renderNotebookBlock(this.source);
    dom.contentEditable = "false";
    dom.dataset.sourceFrom = String(this.from);
    previewSources.set(dom, this.source);
    dom.addEventListener("click", event => event.preventDefault());
    return dom;
  }
  updateDOM(dom: HTMLElement) {
    if (previewSources.get(dom) !== this.source) return false;
    dom.dataset.sourceFrom = String(this.from);
    return true;
  }
  ignoreEvent() { return false; }
}

function previewPosition(view: EditorView, event: MouseEvent): number | null {
  const dom = (event.target as Element)?.closest<HTMLElement>(".notebook-preview-block");
  if (!dom || !view.contentDOM.contains(dom)) return null;
  const block = view.state.field(previews).blocks.find(item => item.from === Number(dom.dataset.sourceFrom));
  if (!block) return null;
  const caret = (document as Document & { caretRangeFromPoint?: (x: number, y: number) => globalThis.Range | null }).caretRangeFromPoint?.(event.clientX, event.clientY);
  let offset = block.source.length;
  const walker = document.createTreeWalker(dom, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  while (walker.nextNode()) nodes.push(walker.currentNode as Text);
  let target = caret ? nodes.indexOf(caret.startContainer as Text) : -1;
  let column = caret?.startOffset ?? 0;
  if (target < 0) {
    // Browsers may return the boundary of a non-editable widget. Measure its real glyphs instead.
    let nearest = Infinity;
    const range = document.createRange();
    nodes.forEach((node, index) => {
      range.selectNodeContents(node);
      if (![...range.getClientRects()].some(rect => event.clientY >= rect.top && event.clientY <= rect.bottom && rect.width)) return;
      let start = 0;
      for (const character of node.data) {
        range.setStart(node, start); range.setEnd(node, start + character.length);
        const rect = range.getBoundingClientRect();
        if (rect.width && event.clientY >= rect.top && event.clientY <= rect.bottom) {
          const distance = Math.max(rect.left - event.clientX, 0, event.clientX - rect.right);
          if (distance < nearest) {
            nearest = distance; target = index;
            column = start + (event.clientX >= (rect.left + rect.right) / 2 ? character.length : 0);
          }
          if (distance === 0) break;
        }
        start += character.length;
      }
    });
    range.detach();
  }
  if (target >= 0) {
    offset = notebookTextOffset(block.source, nodes.map(node => node.data), target, column);
  }
  return block.from + Math.min(offset, block.source.length);
}

const previewMouseSelection = EditorView.mouseSelectionStyle.of((view, event) => {
  if (event.button !== 0) return null;
  let start = previewPosition(view, event);
  if (start === null) return null;
  let originalAnchor = view.state.selection.main.anchor;
  return {
    get(current, extend, multiple) {
      const head = current === event ? start! : previewPosition(view, current) ?? view.posAtCoords({ x: current.clientX, y: current.clientY }) ?? start!;
      const anchor = extend ? originalAnchor : start!;
      const selection = EditorSelection.range(anchor, head);
      return multiple ? EditorSelection.create([...view.state.selection.ranges, selection]) : EditorSelection.create([selection]);
    },
    update(update) {
      start = update.changes.mapPos(start!);
      originalAnchor = update.changes.mapPos(originalAnchor);
    },
  };
});

class ListBullet extends WidgetType {
  toDOM() {
    const bullet = document.createElement("span");
    bullet.className = "notebook-list-bullet"; bullet.textContent = "•";
    bullet.setAttribute("aria-hidden", "true");
    return bullet;
  }
  eq() { return true; }
  ignoreEvent() { return false; }
}

class MathPreview extends WidgetType {
  constructor(readonly source: string) { super(); }
  eq(other: MathPreview) { return this.source === other.source; }
  toDOM() {
    const dom = document.createElement("span");
    dom.className = "notebook-math-preview";
    const rendered = renderNotebookBlock(this.source);
    dom.append(rendered.querySelector("[data-note-math]") ?? document.createTextNode(this.source));
    return dom;
  }
  ignoreEvent() { return false; }
}

function buildPreview(state: EditorState, focused: boolean) {
  const plan = notebookPresentation(state, focused);
  const ranges: Range<Decoration>[] = [];
  for (const line of plan.lines) ranges.push(Decoration.line({ class: [...line.classes].join(" "), attributes: line.attributes }).range(line.from));
  for (const mark of plan.marks) ranges.push(Decoration.mark({ class: mark.className, tagName: mark.tagName, attributes: mark.attributes }).range(mark.from, mark.to));
  for (const hidden of plan.hidden) ranges.push(Decoration.replace({}).range(hidden.from, hidden.to));
  for (const bullet of plan.bullets) ranges.push(Decoration.replace({ widget: new ListBullet() }).range(bullet.from, bullet.to));
  for (const math of plan.math) if (!math.active) ranges.push(Decoration.replace({ widget: new MathPreview(math.source) }).range(math.from, math.to));
  for (const block of plan.complex) {
    if (!block.active) ranges.push(Decoration.replace({ widget: new MarkdownPreview(block.source, block.from), block: true }).range(block.from, block.to));
    else for (let line = state.doc.lineAt(block.from); line.from <= block.to;) {
      ranges.push(Decoration.line({ class: "notebook-complex-source" }).range(line.from));
      if (line.number === state.doc.lines) break;
      line = state.doc.line(line.number + 1);
    }
  }
  return { focused, blocks: plan.complex, decorations: Decoration.set(ranges, true) };
}

const previews = StateField.define<{ focused: boolean; blocks: ReturnType<typeof notebookPresentation>["complex"]; decorations: DecorationSet }>({
  create: state => buildPreview(state, false),
  update(value, transaction) {
    let focused = value.focused;
    for (const effect of transaction.effects) if (effect.is(focusPreview)) focused = effect.value;
    return transaction.docChanged || transaction.selection || focused !== value.focused ? buildPreview(transaction.state, focused) : value;
  },
  provide: field => EditorView.decorations.from(field, value => value.decorations),
});

export function NotebookEditor({ value, onChange, disabled }: { value: string; onChange: (markdown: string) => void; disabled: boolean }) {
  const host = useRef<HTMLDivElement>(null);
  const current = useRef<EditorView | null>(null);
  const lastValue = useRef(value);
  const localEchoes = useRef(new Set<string>());
  const change = useRef(onChange);
  change.current = onChange;
  useEffect(() => {
    if (!host.current) return;
    const view = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: lastValue.current,
        extensions: [
          history(), keymap.of([{ key: "Enter", run: insertNewlineContinueMarkupCommand({ nonTightLists: false }) }, { key: "Backspace", run: deleteMarkupBackward }, { key: "Mod-Shift-z", run: redo }, ...historyKeymap, ...defaultKeymap]),
          markdown({ base: markdownLanguage, addKeymap: false, completeHTMLTags: false, pasteURLAsLink: false }),
          EditorView.lineWrapping, previews, previewMouseSelection,
          editable.of(EditorView.editable.of(!disabled)),
          placeholder("写下笔记…"),
          EditorView.contentAttributes.of(view => ({ role: "textbox", "aria-label": "笔记内容", "aria-multiline": "true", spellcheck: "false", "data-empty": String(view.state.doc.length === 0), "data-preview-focused": String(view.state.field(previews).focused) })),
          EditorView.focusChangeEffect.of((_state, focusing) => focusPreview.of(focusing)),
          EditorState.transactionFilter.of(tr => tr.docChanged && tr.newDoc.length > 20000 && !tr.annotation(Transaction.remote) ? [] : tr),
          EditorView.updateListener.of(update => {
            if (update.docChanged && !update.transactions.every(tr => tr.annotation(Transaction.remote))) {
              lastValue.current = update.state.doc.toString();
              localEchoes.current.add(lastValue.current);
              if (localEchoes.current.size > 64) localEchoes.current.delete(localEchoes.current.values().next().value!);
              change.current(lastValue.current);
            }
          }),
        ],
      }),
    });
    current.current = view;
    return () => { current.current = null; view.destroy(); };
  }, []);
  useLayoutEffect(() => {
    const view = current.current;
    // React can echo an earlier edit after a newer editor transaction (notably undo/redo).
    if (localEchoes.current.delete(value) && view?.hasFocus) return;
    if (!view || value === lastValue.current) return;
    lastValue.current = value;
    // Apply only the changed span so external updates preserve the selection and history.
    const previous = view.state.doc.toString();
    let from = 0, oldEnd = previous.length, newEnd = value.length;
    while (from < oldEnd && from < newEnd && previous[from] === value[from]) from++;
    while (oldEnd > from && newEnd > from && previous[oldEnd - 1] === value[newEnd - 1]) { oldEnd--; newEnd--; }
    view.dispatch({ changes: { from, to: oldEnd, insert: value.slice(from, newEnd) }, annotations: [Transaction.remote.of(true), Transaction.addToHistory.of(false)] });
  }, [value]);
  useEffect(() => { current.current?.dispatch({ effects: editable.reconfigure(EditorView.editable.of(!disabled)) }); }, [disabled]);
  return <div ref={host} className="notebook-rich-editor"/>;
}
