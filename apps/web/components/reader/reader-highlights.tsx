"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject, type CSSProperties } from "react";
import type { ReadingHighlight } from "@paper/core";
import { addHighlightAction, readingHighlightsAction, removeHighlightAction, updateHighlightAction } from "@/app/(site)/actions";
import { highlightQuote, highlightRange, selectionAnchor, type TextAnchor } from "@/lib/reader/highlight-anchor";
import { HighlightQuote } from "./highlight-quote";
import { ReaderHighlightLayer } from "./reader-highlight-layer";
import { Check, Lightbulb, PenLine, Search, Send, Trash2, X } from "../reading-icons";
import { ReaderSelectionHandles } from "./reader-selection-handles";
import { ReaderModelSelect, type ReadingModelOption } from "./reader-model-select";
import { ReaderTooltip } from "./reader-tooltip";

const colors = [
  { value: "#ff626b", name: "红色" }, { value: "#ffc466", name: "橙色" }, { value: "#ffe066", name: "黄色" },
  { value: "#65de76", name: "绿色" }, { value: "#7d82ff", name: "蓝色" }, { value: "#ad79c8", name: "紫色" }, { value: "#cc6af0", name: "粉色" },
];
const highlightName = (color: string) => `reading-highlight-${color.slice(1).toLowerCase()}`;

type HighlightRegistry = { set(name: string, highlight: unknown): void; delete(name: string): void };
const registry = () => (CSS as typeof CSS & { highlights?: HighlightRegistry }).highlights;
// 浮层宽度与 .reader-selection-popover 一致；横向限制在正文栏内，避免盖住目录。
const POPOVER_WIDTH = 460, POPOVER_HEIGHT = 144;
function popoverPlacement(rect: DOMRect, column: DOMRect | undefined) {
  const left = Math.max(12, column?.left ?? 12), right = Math.min(innerWidth - 12, column?.right ?? innerWidth - 12);
  const above = rect.bottom + POPOVER_HEIGHT >= innerHeight;
  return { x: Math.max(left, Math.min(right - POPOVER_WIDTH, rect.left + rect.width / 2 - POPOVER_WIDTH / 2)), y: Math.max(12, above ? rect.top - POPOVER_HEIGHT : rect.bottom + 12), above };
}
function paint(name: string, ranges: Range[]) {
  const Highlight = (window as unknown as { Highlight?: new (...ranges: Range[]) => unknown }).Highlight;
  if (Highlight) registry()?.set(name, new Highlight(...ranges));
}

export function useReaderHighlights(subjectId: string, body: RefObject<HTMLDivElement | null>, openNotes: () => void, ai: {
  models: ReadingModelOption[]; modelId: number | null; onModelChange: (id: number | null) => void;
  chatBusy: boolean; modelError: string; onAsk: (question: string) => void;
}) {
  const [items, setItems] = useState<ReadingHighlight[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [pending, setPending] = useState<{ anchor: TextAnchor; x: number; y: number; above: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [active, setActive] = useState<number | null>(null);
  const [mode, setMode] = useState<"ai" | "note">("ai");
  const [text, setText] = useState("");
  const [color, setColor] = useState("#ffe066");
  const [custom, setCustom] = useState(false);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const pendingRange = useRef<Range | null>(null);
  const [editing, setEditing] = useState<number | null>(null);
  const dragging = useRef(false);
  const [adjusting, setAdjusting] = useState(false);
  function showRange(range: Range, anchor: TextAnchor) {
    pendingRange.current = range.cloneRange();
    const rects = range.getClientRects(), rect = rects[rects.length - 1] ?? range.getBoundingClientRect();
    setPending({ anchor: { quote: anchor.quote, start: anchor.start, prefix: anchor.prefix, suffix: anchor.suffix }, ...popoverPlacement(rect, body.current?.getBoundingClientRect()) });
  }
  useEffect(() => {
    const click = (event: MouseEvent) => {
      if (window.getSelection()?.toString().trim() || !(event.target instanceof Node) || !body.current?.contains(event.target)) return;
      const item = [...items].reverse().find(item => {
        const range = highlightRange(body.current!, item);
        return range && Array.from(range.getClientRects()).some(rect => event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom);
      });
      if (!item) return;
      const range = highlightRange(body.current!, item)!;
      setEditing(item.id); setMode("note"); setColor(item.color); setText(item.comment); showRange(range, item);
    };
    document.addEventListener("click", click);
    return () => document.removeEventListener("click", click);
  }, [items, body]);
  const reload = useCallback(async () => {
    try { const result = await readingHighlightsAction(subjectId); setItems(current => [...new Map([...result, ...current].map(item => [item.id, item])).values()]); setLoaded(true); setError(""); }
    catch { setError("高亮标记加载失败"); }
  }, [subjectId]);
  useEffect(() => { void reload(); }, [reload]);
  useEffect(() => {
    let pointerDown = false;
    let selectingBody = false;
    const shell = body.current?.closest(".reader-shell");
    function endGesture() {
      pointerDown = false;
      selectingBody = false;
      shell?.removeAttribute("data-selecting-body");
    }
    function containSelection() {
      const root = body.current, selection = window.getSelection();
      if (!selectingBody || !root || !selection?.anchorNode || !selection.focusNode || !root.contains(selection.anchorNode) || root.contains(selection.focusNode)) return;
      // A native selection can otherwise span the sibling assistant/notebook window.
      const bounds = document.createRange();
      bounds.selectNodeContents(root);
      const before = bounds.comparePoint(selection.focusNode, selection.focusOffset) < 0;
      selection.extend(root, before ? 0 : root.childNodes.length);
    }
    function select(event: Event) {
      if (pointerDown) { containSelection(); return; }
      if (document.activeElement?.closest(".reader-model-floating") || (event.target instanceof Element && event.target.closest(".reader-model-floating"))) return;
      if (event.target instanceof Node && toolbarRef.current?.contains(event.target)) return;
      if (event.target instanceof Element && event.target.closest(".reader-selection-handle")) return;
      if (dragging.current) return;
      if (toolbarRef.current?.contains(document.activeElement)) return;
      const root = body.current, selection = window.getSelection();
      const anchor = root && selection && selectionAnchor(root, selection);
      if (!anchor || !selection) { setPending(null); return; }
      const range = selection.getRangeAt(0);
      pendingRange.current = range.cloneRange();
      const rects = range.getClientRects(), rect = rects[rects.length - 1] ?? range.getBoundingClientRect();
      setPending(current => current?.anchor.start === anchor.start && current.anchor.quote === anchor.quote ? current : {
        anchor, ...popoverPlacement(rect, root.getBoundingClientRect()),
      });
    }
    function clear(event: Event) { if (event.target instanceof Element && event.target.closest(".reader-model-floating")) return; if (!(event.target instanceof Node) || !toolbarRef.current?.contains(event.target)) setPending(null); }
    function outside(event: PointerEvent) {
      if ((event.target as Element)?.closest?.(".reader-model-floating")) return;
      if ((event.target as Element)?.closest?.(".reader-selection-handle")) return;
      pointerDown = true;
      selectingBody = event.button === 0 && event.target instanceof Node && !!body.current?.contains(event.target);
      if (selectingBody) shell?.setAttribute("data-selecting-body", "");
      if (!toolbarRef.current?.contains(event.target as Node)) { setEditing(null); setPending(null); setText(""); setError(""); }
    }
    function release(event: PointerEvent) {
      containSelection();
      endGesture();
      select(event);
    }
    function escape(event: KeyboardEvent) {
      if (document.querySelector('.reader-model-menu')) return;
      if (event.key === "Escape" && toolbarRef.current) { event.preventDefault(); event.stopPropagation(); setPending(null); window.getSelection()?.removeAllRanges(); }
    }
    document.addEventListener("pointerup", release);
    document.addEventListener("pointercancel", endGesture);
    window.addEventListener("blur", endGesture);
    document.addEventListener("selectionchange", select);
    document.addEventListener("keyup", select);
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape, true);
    document.addEventListener("scroll", clear, true);
    window.addEventListener("resize", clear);
    return () => {
      endGesture();
      document.removeEventListener("pointerup", release);
      document.removeEventListener("pointercancel", endGesture);
      window.removeEventListener("blur", endGesture);
      document.removeEventListener("selectionchange", select);
      document.removeEventListener("keyup", select);
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape, true);
      document.removeEventListener("scroll", clear, true);
      window.removeEventListener("resize", clear);
    };
  }, [body]);
  useEffect(() => {
    paint("reading-selection", pending && pendingRange.current ? [pendingRange.current] : []);
    return () => { registry()?.delete("reading-selection"); };
  }, [pending]);
  useEffect(() => {
    const root = body.current;
    if (!root) return;
    const names = [...new Set(items.map(item => item.color))];
    for (const color of names) paint(highlightName(color), items.filter(item => item.color === color).flatMap(item => { const range = highlightRange(root, item); return range ? [range] : []; }));
    const chosen = items.find(item => item.id === active), range = chosen && highlightRange(root, chosen);
    paint("reading-highlight-active", range ? [range] : []);
    return () => { names.forEach(color => registry()?.delete(highlightName(color))); registry()?.delete("reading-highlight-active"); };
  }, [items, active, body]);
  async function add() {
    if (!pending || busy) return;
    setBusy(true); setError("");
    try {
      const item = editing == null ? await addHighlightAction(subjectId, pending.anchor, { color, comment: text.trim() }) : await updateHighlightAction(subjectId, editing, text.trim(), { color, anchor: pending.anchor });
      setItems(current => [...current.filter(value => value.id !== item.id), item].sort((a, b) => a.start - b.start));
      setActive(item.id); setEditing(null); setPending(null); setText(""); window.getSelection()?.removeAllRanges(); openNotes();
    } catch (e) { setError(e instanceof Error ? e.message : "高亮失败，请重试"); }
    finally { setBusy(false); }
  }
  function ask(quick = false) {
    if (!pending || ai.chatBusy) return;
    const question = quick ? "请用通俗的语言快速解释这段内容，说明关键概念和它在文中的作用。" : text.trim();
    if (!question) { toolbarRef.current?.querySelector("textarea")?.focus(); return; }
    ai.onAsk(`引用正文：\n${pending.anchor.quote}\n\n${question}`);
    setPending(null); setText(""); window.getSelection()?.removeAllRanges();
  }
  function jump(item: ReadingHighlight) {
    const range = body.current && highlightRange(body.current, item);
    if (!range) { setError("原文已更新，暂时无法定位这条标记"); return; }
    setActive(item.id); setError("");
    const element = range.startContainer.parentElement;
    element?.scrollIntoView({ block: "center", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
  }
  const list = <NotebookHighlights body={body} subjectId={subjectId} items={items} loaded={loaded} active={active} error={error} onRetry={reload} onJump={jump}
    onComment={item => setItems(current => current.map(value => value.id === item.id ? item : value))}
    onRemove={async id => { await removeHighlightAction(subjectId, id); setItems(current => current.filter(item => item.id !== id)); }}/>;
  const paintStyles = [...new Set(items.map(item => item.color))].filter(color => /^#[0-9a-f]{6}$/i.test(color)).map(color => `::highlight(${highlightName(color)}) { background-color:transparent; }`).join("\n");
  const toolbar = <>
    <ReaderHighlightLayer body={body} items={items} pendingRange={pending ? pendingRange.current : null} pendingColor={mode === "note" ? `${color}66` : "#dce3f4"}/>
    {pending && pendingRange.current && <ReaderSelectionHandles range={pendingRange.current} onStart={() => { dragging.current = true; setAdjusting(true); }} onEnd={() => { setAdjusting(false); setTimeout(() => { dragging.current = false; }, 0); }} onChange={range => {
      dragging.current = true;
      const selection = window.getSelection();
      if (!selection || !body.current) return;
      selection.removeAllRanges(); selection.addRange(range);
      const anchor = selectionAnchor(body.current, selection);
      if (anchor) showRange(range, anchor);
    }}/>}
    <style>{paintStyles + "\n::highlight(reading-selection) { background-color:transparent; }" + (pending ? "\n.reader-body ::selection { background-color:transparent; color:inherit; }" : "")}</style>
    {pending && <div ref={toolbarRef} hidden={adjusting} className="reader-selection-popover" data-placement={pending.above ? "above" : "below"} role="dialog" aria-label="选中文字" style={{ left: pending.x, top: pending.y }} onPointerDown={event => {
      if (!(event.target as HTMLElement).closest("textarea,select,input")) event.preventDefault();
    }}>
      <form onSubmit={event => { event.preventDefault(); if (mode === "note") void add(); else ask(); }}>
        <textarea aria-label={mode === "ai" ? "询问 AI 助手" : "添加笔记"} placeholder={mode === "ai" ? "针对选中文字提问…" : "笔记（可选）"} rows={2} maxLength={mode === "ai" ? 4000 : 5000} value={text} disabled={busy} onChange={event => setText(event.target.value)} onKeyDown={event => {
          if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); if (mode === "note") void add(); else ask(); }
        }}/>
        <div className="reader-selection-actions">
          <div className="reader-selection-modes" role="group" aria-label="选区操作">
            <button type="button" aria-pressed={mode === "ai"} onClick={() => setMode("ai")}>向 AI 提问</button>
            <button type="button" aria-pressed={mode === "note"} onClick={() => setMode("note")}>笔记</button>
          </div>
          <div className="reader-selection-tools">
            {editing != null && <ReaderTooltip label="删除高亮" className="reader-selection-delete"><button type="button" className="reader-selection-icon" aria-label="删除当前高亮" disabled={busy} onClick={async () => {
              setBusy(true);
              try { await removeHighlightAction(subjectId, editing); setItems(current => current.filter(item => item.id !== editing)); setEditing(null); setPending(null); window.getSelection()?.removeAllRanges(); }
              catch { setError("删除失败，请重试"); } finally { setBusy(false); }
            }}><Trash2 size={18}/></button></ReaderTooltip>}
            {mode === "note" ? <>
              <div className="reader-selection-colors" role="group" aria-label="高亮颜色">{colors.map(option => <ReaderTooltip key={option.value} label={option.name}><button type="button" className="reader-color-swatch" style={{ "--swatch": option.value } as CSSProperties} aria-label={option.name} aria-pressed={color === option.value} onClick={() => { setColor(option.value); setCustom(false); }}>{color === option.value && <Check size={14}/>}</button></ReaderTooltip>)}
                <ReaderTooltip label="自定义颜色"><label className="reader-custom-color" data-selected={custom || undefined}><input type="color" aria-label="自定义高亮颜色" value={color} onChange={event => { setColor(event.target.value); setCustom(true); }}/></label></ReaderTooltip>
              </div>
              <ReaderTooltip label="保存高亮"><button type="submit" className="reader-selection-primary" aria-label="保存高亮笔记" disabled={busy}><PenLine size={20}/></button></ReaderTooltip>
            </> : <>
              <ReaderTooltip label="切换模型"><ReaderModelSelect models={ai.models} value={ai.modelId} onChange={ai.onModelChange} compact disabled={ai.chatBusy}/></ReaderTooltip>
              {text.trim()
                ? <ReaderTooltip label={ai.chatBusy ? "回答中" : "发送问题"}><button type="submit" className="reader-selection-primary" aria-label="发送问题" disabled={ai.chatBusy}><Send size={18}/></button></ReaderTooltip>
                : <ReaderTooltip label={ai.chatBusy ? "回答中" : "解释选中文字"}><button type="button" className="reader-selection-primary" aria-label="快速解释" disabled={ai.chatBusy} onClick={() => ask(true)}><Lightbulb size={20}/></button></ReaderTooltip>}
            </>}
          </div>
        </div>
      </form>
      {(error || (mode === "ai" && (ai.modelError || ai.chatBusy))) && <p role="status" className="reader-selection-status">{error || ai.modelError || "助手正在回答，请稍候…"}</p>}
    </div>}
  </>;
  return { list, toolbar };
}

function NotebookHighlights({ body, subjectId, items, loaded, active, error, onRetry, onJump, onComment, onRemove }: {
  body: RefObject<HTMLDivElement | null>;
  subjectId: string; items: ReadingHighlight[]; loaded: boolean; active: number | null; error: string;
  onRetry: () => void; onJump: (item: ReadingHighlight) => void; onComment: (item: ReadingHighlight) => void; onRemove: (id: number) => Promise<void>;
}) {
  const [query, setQuery] = useState("");
  const needle = query.trim().toLocaleLowerCase();
  const filtered = items.filter(item => `${item.quote}\n${item.comment}`.toLocaleLowerCase().includes(needle));
  return <section className="notebook-highlights" aria-label="高亮标记">
    <h3><PenLine size={16}/>高亮标记 {items.length > 0 && <span>{items.length}</span>}</h3>
    {items.length > 0 && <div className="notebook-highlight-search"><Search size={17}/><input type="search" aria-label="搜索高亮标记" placeholder="搜索标记或批注" value={query} onChange={event => setQuery(event.target.value)}/>{query && <button type="button" aria-label="清空搜索" onClick={() => setQuery("")}><X size={15}/></button>}</div>}
    {error && <p role="alert">{error} <button type="button" onClick={onRetry}>重试</button></p>}
    {!loaded && !error && <p className="notebook-highlight-empty" role="status">正在加载…</p>}
    {loaded && !filtered.length && <p className="notebook-highlight-empty">{needle && items.length > 0 ? "无匹配结果" : "选中文字可添加高亮"}</p>}
    <div className="notebook-highlight-list">{items.map(item => <HighlightItem key={item.id} body={body} hidden={!filtered.some(match => match.id === item.id)} item={item} subjectId={subjectId} active={active === item.id} onJump={() => onJump(item)} onComment={onComment} onRemove={() => onRemove(item.id)}/>)}</div>
  </section>;
}

function HighlightItem({ body, subjectId, item, active, hidden, onJump, onComment, onRemove }: { body: RefObject<HTMLDivElement | null>; subjectId: string; item: ReadingHighlight; active: boolean; hidden: boolean; onJump: () => void; onComment: (item: ReadingHighlight) => void; onRemove: () => Promise<void> }) {
  const [text, setText] = useState(item.comment), [error, setError] = useState(""), [saving, setSaving] = useState(false), [removing, setRemoving] = useState(false);
  const key = `reading-highlight-draft:${subjectId}:${item.id}`;
  const state = useRef({ text: item.comment, saved: item.comment, working: false, alive: true, deleted: false });
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const commentInput = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const current = state.current;
    if (!current.working && current.text === current.saved && item.comment !== current.saved) {
      current.text = current.saved = item.comment;
      setText(item.comment);
    }
  }, [item.comment]);
  useLayoutEffect(() => {
    const input = commentInput.current;
    if (!input || hidden) return;
    input.style.height = "auto";
    input.style.height = `${Math.min(160, input.scrollHeight)}px`;
  }, [text, hidden]);
  const flush = useRef(async () => {});
  flush.current = async () => {
    const current = state.current;
    clearTimeout(timer.current);
    if (current.working || current.deleted || current.text === current.saved) return;
    current.working = true;
    if (current.alive) { setSaving(true); setError(""); }
    try {
      while (!current.deleted && current.text !== current.saved) {
        const value = current.text;
        const updated = await updateHighlightAction(subjectId, item.id, value);
        current.saved = value;
        if (current.text === value) { try { localStorage.removeItem(key); } catch {} }
        if (!current.deleted) onComment({ ...updated, comment: current.text });
      }
    } catch { if (current.alive && !current.deleted) { setError("保存失败，正在重试"); timer.current = setTimeout(() => void flush.current(), 5000); } }
    finally { current.working = false; if (current.alive) setSaving(false); }
  };
  useEffect(() => {
    state.current.alive = true;
    try { const draft = localStorage.getItem(key); if (draft !== null && draft !== state.current.saved) { state.current.text = draft; setText(draft); timer.current = setTimeout(() => void flush.current(), 600); } } catch {}
    return () => { state.current.alive = false; clearTimeout(timer.current); void flush.current(); };
  }, [key]);
  return <article className="notebook-highlight-item" hidden={hidden} data-active={active || undefined}>
    <div className="notebook-highlight-quote" style={{ borderLeftColor: item.color }}><button type="button" className="notebook-highlight-jump" title="返回原文" onClick={onJump}><HighlightQuote parts={body.current ? highlightQuote(body.current, item) : [{ type: "text", value: item.quote }]}/></button><button type="button" className="notebook-highlight-remove" aria-label="删除高亮标记" disabled={removing} onClick={async () => {
      setRemoving(true); setError(""); state.current.deleted = true;
      try { await onRemove(); clearTimeout(timer.current); try { localStorage.removeItem(key); } catch {} }
      catch { state.current.deleted = false; setError("删除失败，请重试"); setRemoving(false); }
    }}><Trash2 size={15}/></button></div>
    <textarea ref={commentInput} aria-label="高亮批注" placeholder="批注（可选）" rows={1} maxLength={5000} value={text} disabled={removing} onBlur={() => void flush.current()} onChange={event => {
      const value = event.target.value; state.current.text = value; setText(value); onComment({ ...item, comment: value });
      try { localStorage.setItem(key, value); } catch {}
      clearTimeout(timer.current); timer.current = setTimeout(() => void flush.current(), 600);
    }}/>
    {error ? <span role="alert" className="notebook-highlight-state">{error}</span> : saving && <span role="status" className="notebook-highlight-state">正在保存…</span>}
  </article>;
}
