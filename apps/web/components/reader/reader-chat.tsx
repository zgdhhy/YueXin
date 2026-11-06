"use client";
import { useLayoutEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, History, NotebookPen, Plus } from "../reading-icons";
import type { ReadingConversationSummary } from "@paper/core";
import { deletePaperChatAction, newPaperChatAction, paperChatAction, paperChatsAction, renamePaperChatAction, saveAnswerNoteAction } from "@/app/(site)/actions";
import { readChatStream } from "@/lib/reader/reader-chat-stream";
import { ChatThread, type ChatMessage } from "../chat";
import { Markdown } from "../Markdown";
import { PaperConversationList } from "./paper-conversation-list";
import { ReaderModelSelect, type ReadingModelOption } from "./reader-model-select";
import { MessageCopyButton } from "../message-copy-button";

export function ReaderChat({ subjectId, initialConversations, initialMessages, active, kind = "paper", models, modelId, onModelChange, selectionRequest, onBusyChange }: {
    subjectId: string;
    initialConversations: ReadingConversationSummary[];
    initialMessages: ChatMessage[];
    active: boolean;
    kind?: "paper" | "report";
    models: ReadingModelOption[];
    modelId: number | null;
    onModelChange: (id: number | null) => void;
    selectionRequest: { id: number; text: string } | null;
    onBusyChange: (busy: boolean) => void;
}) {
    const [conversations, setConversations] = useState(initialConversations);
    const [selected, setSelected] = useState<number | null>(initialConversations[0]?.id ?? null);
    const [messages, setMessages] = useState(initialMessages);
    const [history, setHistory] = useState(false);
    const historyButton = useRef<HTMLButtonElement>(null);
    const wasHistory = useRef(false);
    useLayoutEffect(() => {
        if (wasHistory.current && !history) historyButton.current?.focus({preventScroll: true});
        wasHistory.current = history;
    }, [history]);
    const [busy, setBusy] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [saved, setSaved] = useState<number[]>([]);
    const [drafts, setDrafts] = useState<Record<string, string>>({});
    const router = useRouter();
    const disabled = busy || loading;
    useLayoutEffect(() => { onBusyChange(disabled); }, [disabled, onBusyChange]);
    const current = conversations.find(c => c.id === selected);
    const draftKey = String(selected ?? "new");
    const draftKeyRef = useRef(draftKey);
    draftKeyRef.current = draftKey;
    async function manage(fn: () => Promise<void>) {
        if (disabled)
            return;
        setLoading(true);
        setError("");
        try {
            await fn();
        }
        catch (e) {
            setError(e instanceof Error ? e.message : "操作失败，请重试");
        }
        finally {
            setLoading(false);
        }
    }
    async function select(id: number) {
        const result = await paperChatAction(subjectId, id);
        setSelected(id);
        setMessages(result.messages);
        setHistory(false);
    }
    return <div className="reader-chat-content" onKeyDown={e => { if (e.key === "Escape" && history) { e.stopPropagation(); setHistory(false); } }}>
    <div className="reader-chat-controls">
      {history && <button type="button" aria-label="返回对话" title="返回对话" onClick={() => setHistory(false)}><ArrowLeft size={17}/></button>}
      <div className="reader-chat-title"><h2 hidden={!history}>历史会话</h2>{!history && current && <span title={current.title}>{current.title}</span>}</div>
      {!history && <button type="button" ref={historyButton} aria-label="历史会话" aria-expanded={false} disabled={disabled} onClick={() => void manage(async () => { setConversations(await paperChatsAction(subjectId)); setHistory(true); })}><History size={16}/><span>历史</span></button>}
      <button type="button" className="reader-chat-new" aria-label="新建对话" disabled={disabled} onClick={() => void manage(async () => {
        const id = await newPaperChatAction(subjectId);
        setConversations(await paperChatsAction(subjectId)); await select(id);
        setDrafts(current => current.new ? { ...current, [id]: current.new, new: "" } : current);
      })}><Plus size={16}/><span>新对话</span></button>
    </div>
    {history && <PaperConversationList conversations={conversations} selected={selected} disabled={disabled} onWorking={setLoading}
      onSelect={select}
      onRename={async (id, title) => { setConversations(await renamePaperChatAction(subjectId, id, title)); }}
      onDelete={async id => {
        const list = await deletePaperChatAction(subjectId, id);
        setConversations(list);
        setDrafts(drafts => { const next = {...drafts}; delete next[String(id)]; return next; });
        if (id === selected) {
          setSelected(null);
          setMessages([]);
          if (list.length) await select(list[0].id);
          else { setSelected(null); setMessages([]); setHistory(false); }
        }
      }}/>}
    {error && <p role="alert" className="reader-chat-error">{error}</p>}
    <div className="reader-chat-thread" hidden={history}>
    <ChatThread disabled={loading} variant="reader" messages={messages} onMessages={setMessages} renderStreaming={text => <Markdown source={text}/>} threadKey={selected} active={active} submission={selectionRequest} composerTools={<ReaderModelSelect models={models} value={modelId} onChange={onModelChange} disabled={disabled}/>} draft={drafts[draftKey] ?? ""} onDraftChange={value => setDrafts(d => ({ ...d, [draftKeyRef.current]: value }))} onBusyChange={setBusy} send={async (q, startNew, onText) => {
            let id = selected;
            if (id == null || startNew) {
                if (startNew) {
                    draftKeyRef.current = "new";
                    setSelected(null); setMessages([]); setHistory(false);
                }
                id = await newPaperChatAction(subjectId);
                draftKeyRef.current = String(id);
                setSelected(id);
                if (startNew) { setMessages([]); setHistory(false); }
            }
            const result = await readChatStream(await fetch("/api/reader/chat", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ subjectId, question: q, conversationId: id, modelId }),
            }), onText ?? (() => {}));
            // 会话列表加载失败不应把已成功的回答当作发送失败。
            try {
                setConversations(await paperChatsAction(subjectId));
            }
            catch { /* 下次打开历史时重载 */ }
            return result;
        }} placeholder="输入问题…" empty={<div className="reader-chat-start">{(kind === "report" ? ["本月有哪些研究趋势？", "这些研究有何联系？", "哪些判断仍待验证？"] : ["核心方法如何工作？", "实验有哪些局限？", "与已有方法有何区别？"]).map(question => <button key={question} type="button" onClick={() => setDrafts(d => ({...d, [draftKey]: question}))}>{question}<Plus size={14}/></button>)}</div>} renderAssistant={m => <>
        <Markdown source={m.content}/>
        <div className="reader-answer-actions">
        <MessageCopyButton text={m.content} label="复制回答"/>
        <button type="button" className="reader-save-answer" disabled={saved.includes(m.id)} onClick={async () => { try {
            await saveAnswerNoteAction(subjectId, m.id);
            setSaved(ids => [...ids, m.id]);
            router.refresh();
        }
        catch (e) {
            setError(e instanceof Error ? e.message : "保存失败");
        } }}>
        <NotebookPen size={14}/>{saved.includes(m.id) ? "已存为笔记" : "存为笔记"}</button>
        </div>
        </>}/>
    </div>
  </div>;
}
