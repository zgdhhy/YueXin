"use client";

import { useEffect, useLayoutEffect, useRef, useState, useTransition } from "react";
import { Loader2, Send, X } from "@/components/reading-icons";
import { ArrowUpToLine } from "./reader/reader-tool-icons";
import { MessageCopyButton } from "./message-copy-button";

/** 右侧抽屉（手机全屏）：Esc、遮罩、关闭按钮都会关闭 */
export function Drawer({ open, onClose, title, actions, children }: { open: boolean; onClose: () => void; title: string; actions?: React.ReactNode; children: React.ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => e.target === ref.current && onClose()}
      className="my-0 mr-0 ml-auto h-dvh max-h-dvh w-full max-w-none bg-white p-0 text-[#243447] shadow-2xl outline-none backdrop:bg-slate-900/40 sm:w-[520px]"
    >
      <div className="flex h-full flex-col">
        <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-3">
          <h2 className="min-w-0 flex-1 truncate text-base font-semibold">{title}</h2>
          {actions}
          <button type="button" onClick={onClose} aria-label="关闭" className="flex h-10 w-10 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700">
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}

export type ChatMessage = { id: number; role: "user" | "assistant"; content: string; thinkingMs?: number };

/**
 * 对话线程：消息列表 + 输入框。send 返回新增的消息或错误；
 * renderAssistant 自定义助手消息（如 Markdown、草稿卡片）。
 */
export function ChatThread<M extends ChatMessage>({
  messages,
  onMessages,
  send,
  renderAssistant,
  placeholder,
  empty,
  draft,
  onDraftChange,
  onBusyChange,
  threadKey,
  active = true,
  variant = "default",
  composerTools,
  submission,
  renderStreaming,
  disabled = false,
}: {
  messages: M[];
  onMessages: (next: M[]) => void;
  send: (text: string, startNew?: boolean, onText?: (delta: string, reset?: boolean) => void) => Promise<{ messages?: M[]; error?: string }>;
  renderAssistant: (m: M) => React.ReactNode;
  placeholder: string;
  empty: React.ReactNode;
  draft?: string;
  onDraftChange?: (value: string) => void;
  onBusyChange?: (busy: boolean) => void;
  threadKey?: number | null;
  active?: boolean;
  variant?: "default" | "reader";
  composerTools?: React.ReactNode;
  submission?: { id: number; text: string } | null;
  renderStreaming?: (text: string) => React.ReactNode;
  disabled?: boolean;
}) {
  const [localText, setLocalText] = useState("");
  const text = draft ?? localText;
  const setText = onDraftChange ?? setLocalText;
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const [asking, setAsking] = useState("");
  const [streamed, setStreamed] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const [thinkingMs, setThinkingMs] = useState<number | null>(null);
  const startedAt = useRef(0), firstTextAt = useRef<number | null>(null);
  const inFlight = useRef(false);
  useEffect(() => {
    if (!pending) return;
    const timer = setInterval(() => setElapsed(Date.now() - startedAt.current), 100);
    return () => clearInterval(timer);
  }, [pending]);
  const scroller = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const composer = useRef<HTMLFormElement>(null);
  useLayoutEffect(() => {
    if (variant !== "reader" || !composer.current || !scroller.current) return;
    const form = composer.current;
    const measure = () => form.parentElement?.style.setProperty("--reader-composer-space", `${form.offsetHeight + 30}px`);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(form);
    return () => observer.disconnect();
  }, [variant]);
  useLayoutEffect(() => {
    if (variant !== "reader" || !input.current) return;
    input.current.style.height = "auto";
    input.current.style.height = `${Math.min(120, Math.max(42, input.current.scrollHeight))}px`;
  }, [text, variant, active]);
  const follow = useRef(true);
  useEffect(() => { onBusyChange?.(pending); }, [pending, onBusyChange]);
  useEffect(() => { setError(""); follow.current = true; const el = scroller.current; if (el) el.scrollTop = el.scrollHeight; }, [threadKey]);
  useEffect(() => {
    const el = scroller.current;
    if (el && follow.current) el.scrollTop = el.scrollHeight;
  }, [messages.length, pending, active, streamed]);
  const submit = (requested?: string, startNew = false) => {
    const q = (requested ?? text).trim();
    if (!q || pending || disabled || inFlight.current) return;
    inFlight.current = true;
    startedAt.current = Date.now(); firstTextAt.current = null;
    setElapsed(0); setThinkingMs(null); setStreamed("");
    setError("");
    follow.current = true;
    setAsking(q);
    if (!startNew) setText("");
    start(async () => {
      try {
        const r = await send(q, startNew, (delta, reset) => {
          if (reset) { setStreamed(""); firstTextAt.current = null; setThinkingMs(null); return; }
          if (!delta) return;
          if (firstTextAt.current == null) { firstTextAt.current = Date.now(); setThinkingMs(firstTextAt.current - startedAt.current); }
          setStreamed(current => current + delta);
        });
        if (r.messages) onMessages([...(startNew ? [] : messages), ...r.messages.map(message => message.role === "assistant" ? { ...message, thinkingMs: (firstTextAt.current ?? Date.now()) - startedAt.current } : message)]);
        else throw new Error(r.error ?? "发送失败");
      } catch (e) {
        setError(e instanceof Error ? e.message : "发送失败，请重试");
        setText(q);
      }
      setAsking("");
      setStreamed(""); inFlight.current = false;
    });
  };
  const submitted = useRef<number | null>(null);
  useEffect(() => {
    if (!submission || submitted.current === submission.id || pending || disabled) return;
    submitted.current = submission.id;
    submit(submission.text, true);
  }, [submission, pending, disabled]);
  return (
    <>
      <div ref={scroller} onScroll={e => { const el = e.currentTarget; follow.current = el.scrollHeight - el.scrollTop - el.clientHeight < 64; }} className="chat-messages min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-5" aria-live="polite" aria-relevant="additions">
        {!messages.length && !pending && <div className="text-sm leading-relaxed text-slate-500">{empty}</div>}
        {messages.map((m) =>
          m.role === "user" ? (
            <div key={m.id} className="chat-user">{m.content}{variant === "reader" && <MessageCopyButton text={m.content} label="复制提问" iconOnly/>}</div>
          ) : (
            <div key={m.id} className="chat-assistant">{m.thinkingMs != null && <div className="reader-thinking-time">已思考 {(m.thinkingMs / 1000).toFixed(1)} 秒</div>}{renderAssistant(m)}</div>
          ),
        )}
        {pending && (
          <>
            <div className="chat-user">{asking}{variant === "reader" && <MessageCopyButton text={asking} label="复制提问" iconOnly/>}</div>
            <div className="chat-pending flex items-center gap-2 text-sm text-slate-500" role="status"><Loader2 className="h-4 w-4 animate-spin" />{streamed ? `已思考 ${((thinkingMs ?? 0) / 1000).toFixed(1)} 秒 · 输出中` : `思考中 · ${(elapsed / 1000).toFixed(1)} 秒`}</div>
            {streamed && <div className="chat-assistant reader-streaming" aria-busy="true">{renderStreaming ? renderStreaming(streamed) : <div style={{ whiteSpace: "pre-wrap" }}>{streamed}</div>}</div>}
          </>
        )}
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      </div>
      <form
        ref={composer}
        className={variant === "reader" ? "reader-composer" : "flex items-end gap-2 border-t border-slate-100 px-4 py-3"}
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <textarea
          ref={input}
          disabled={disabled}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              submit();
            }
          }}
          rows={variant === "reader" ? 1 : 2}
          placeholder={placeholder}
          aria-label={placeholder}
          className={variant === "reader" ? "reader-chat-input" : "min-h-11 flex-1 resize-none rounded-md border border-slate-300 px-3 py-2 text-base leading-relaxed focus:border-[#147d92] focus:outline-none sm:text-sm"}
        />
        {composerTools}
        <button type="submit" disabled={disabled || pending || !text.trim()} aria-label="发送" className={variant === "reader" ? "reader-chat-send" : "flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-[#243447] text-white disabled:opacity-40"}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : variant === "reader" ? <ArrowUpToLine className="h-4 w-4"/> : <Send className="h-4 w-4" />}
        </button>
      </form>
    </>
  );
}
