"use client";

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { ArrowUpToLine, Info, MessageCircleQuestion, NotebookPen } from "./reader-tool-icons";
import { readingScroller } from "@/lib/reader/reader-scroll";
import type { ReadingConversationSummary } from "@paper/core";
import type { ChatMessage } from "../chat";
import type { PanelView } from "@/lib/reader/reader-panel-layout";
import { Toc } from "../site/site-client";
import { ReaderNotebook } from "./reader-client";
import { ReaderChat } from "./reader-chat";
import { ReaderPanel } from "./reader-panel";
import { useReaderPanel } from "./use-reader-panel";
import { useReaderHighlights } from "./reader-highlights";
import { readingModelsAction } from "@/app/(site)/actions";
import type { ReadingModelOption } from "./reader-model-select";
import "./reader-workspace.css";

export function ReaderWorkspace({ subjectId, kind = "paper", toc, conversations, initialMessages, resources, note, heading, overview, children }: {
  subjectId: string;
  kind?: "paper" | "report";
  toc: { id: string; text: string }[];
  conversations: ReadingConversationSummary[];
  initialMessages: ChatMessage[];
  resources: ReactNode;
  note: string;
  heading: ReactNode;
  overview: ReactNode;
  children: ReactNode;
}) {
  const [view, setView] = useState<PanelView | null>(null);
  const [closing, setClosing] = useState(false);
  const trigger = useRef<HTMLElement | null>(null);
  const c = useReaderPanel();
  const lastTrigger = useRef<PanelView>("qa");
  const informationLabel = kind === "paper" ? "论文信息" : "月报信息";
  const tools = [
    { key: "qa", label: "AI 助手", Icon: MessageCircleQuestion },
    { key: "notes", label: "笔记", Icon: NotebookPen },
    { key: "resources", label: informationLabel, Icon: Info },
  ] as const;
  const openingOrigin = useRef({ x: 0, y: 0 });
  const highlightBody = useRef<HTMLDivElement>(null);
  const [models, setModels] = useState<ReadingModelOption[]>([]);
  const [modelId, setModelId] = useState<number | null>(null);
  const [modelError, setModelError] = useState("");
  const [chatBusy, setChatBusy] = useState(false);
  const [selectionRequest, setSelectionRequest] = useState<{ id: number; text: string } | null>(null);
  useEffect(() => {
    let alive = true;
    void readingModelsAction(subjectId).then(result => { if (alive) { setModels(result); setModelId(current => result.some(model => model.id === current) ? current : (result.find(model => model.isDefault) ?? result[0])?.id ?? null); setModelError(""); } }).catch(() => { if (alive) setModelError("模型列表加载失败，请重新打开页面重试"); });
    return () => { alive = false; };
  }, [subjectId]);
  const highlights = useReaderHighlights(subjectId, highlightBody, () => open("notes"), {
    models, modelId, onModelChange: setModelId, chatBusy, modelError,
    onAsk: text => { setSelectionRequest({ id: Date.now(), text }); open("qa"); },
  });
  const open = (next: PanelView) => {
    lastTrigger.current = next;
    setClosing(false);
    c.preserveReading();
    if (!view) {
      c.resetForOpen();
      const button = document.querySelector(`[data-reader-trigger="${next}"]`)?.getBoundingClientRect();
      openingOrigin.current = { x: button?.width ? button.x + button.width / 2 : innerWidth - 40, y: button?.height ? button.y + button.height / 2 : innerHeight - 46 };
    }
    setView(next);
  };
  const close = () => { setClosing(true); };
  const finishClose = () => {
    c.preserveReading(); c.exitFullscreen(); setView(null); setClosing(false);
  };
  const wasOpen = useRef(false);
  useLayoutEffect(() => {
    if (view && !wasOpen.current) document.getElementById("reader-panel")?.focus({ preventScroll: true });
    if (!view && wasOpen.current) {
      const opener = trigger.current?.isConnected ? trigger.current : document.querySelector<HTMLElement>(`[data-reader-trigger="${lastTrigger.current}"]`);
      opener?.focus({ preventScroll: true });
    }
    wasOpen.current = !!view;
  }, [view]);
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      // Nested menus and history handle Escape before it reaches the window.
      if (event.key === "Escape" && !event.defaultPrevented && !document.querySelector("dialog[open]") && view) {
        c.preserveReading();
        if (c.mode === "fullscreen") c.exitFullscreen();
        else close();
      }
    };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  });
  const docked = !!view && (c.mode === "left" || c.mode === "right");
  const rail = <nav className="reader-tools" aria-label="阅读工具">{tools.map(({ key, label, Icon }) => <button key={key} type="button" data-reader-trigger={key} aria-label={label} aria-expanded={view === key} aria-pressed={view === key} aria-controls="reader-panel" className={key === "qa" ? "reader-ask-button" : ""} onClick={event => {
    trigger.current = event.currentTarget;
    lastTrigger.current = key;
    if (view === key && !closing) close(); else open(key);
  }}><Icon size={21}/><span>{label}</span></button>)}<button type="button" aria-label="返回顶部" onClick={() => {
    const options: ScrollToOptions = { top: 0, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" };
    const scroller = readingScroller();
    if (scroller) scroller.scrollTo(options); else window.scrollTo(options);
  }}><ArrowUpToLine size={21}/><span>返回顶部</span></button></nav>;
  return (
    <div className="reader-shell" data-kind={kind} data-panel-open={!!view} data-dock={docked ? c.mode : undefined} data-resizing={c.dragging || undefined} style={{ "--reader-panel-width": c.dockWidth + "px", "--reader-screen-width": c.viewport.width + "px", "--reader-copy-left": (c.viewport.shellLeft + (docked && c.mode === "left" ? c.dockWidth + 24 : 0)) + "px" } as CSSProperties}>
      <div ref={c.shell} className="reader-surface">
      <div className="reader-copy" inert={!!view && c.mode === "fullscreen"}>
        <div className="reader-document-layout">
        <aside id="reader-directory" className="reader-sidebar"><nav className="reader-toc" aria-label="阅读目录"><Toc items={toc}/></nav></aside>
        <div className="reader-document-content">
        <div className="reader-intro">{heading}</div>
        <div className="reader-workspace"><div className="reader-body" ref={highlightBody}>{overview}{children}</div></div>
        </div>
        </div>
      </div>
      {!view && rail}
      <ReaderPanel view={view} closing={closing} onClosed={finishClose} informationLabel={informationLabel} tools={view ? rail : null} origin={openingOrigin.current} controller={c} onClose={close}>
        <div id="reader-view-qa" role="region" aria-label="AI 助手内容" className="reader-qa-slot" hidden={view !== "qa"}>
          <ReaderChat subjectId={subjectId} kind={kind} initialConversations={conversations} initialMessages={initialMessages} active={view === "qa"} models={models} modelId={modelId} onModelChange={setModelId} selectionRequest={selectionRequest} onBusyChange={setChatBusy}/>
          {modelError && <p role="alert" className="reader-chat-error">{modelError}</p>}
        </div>
        <div id="reader-view-notes" role="region" aria-label="笔记内容" className="reader-panel-scroll" hidden={view !== "notes"}>
          <ReaderNotebook subjectId={subjectId} initialContent={note} highlights={highlights.list}/>
        </div>
        <div id="reader-view-resources" role="region" aria-label={informationLabel} className="reader-panel-scroll" hidden={view !== "resources"}>{resources}</div>
      </ReaderPanel>
      {highlights.toolbar}
      </div>
    </div>
  );
}
