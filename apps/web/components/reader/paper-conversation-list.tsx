"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { Check, Pencil, Trash2, X } from "@/components/reading-icons";
import { ReaderTooltip } from "./reader-tooltip";
import type { PaperConversationSummary } from "@paper/core";

type Props = {
  conversations: PaperConversationSummary[];
  selected: number | null;
  disabled: boolean;
  onWorking: (working: boolean) => void;
  onSelect: (id: number) => Promise<void>;
  onRename: (id: number, title: string) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
};

/** Each operation carries its own conversation ID, independent of the open thread. */
export function PaperConversationList({ conversations, selected, disabled, onWorking, onSelect, onRename, onDelete }: Props) {
  const [editing, setEditing] = useState<number | null>(null);
  const [deleting, setDeleting] = useState<number | null>(null);
  const [title, setTitle] = useState("");
  const [error, setError] = useState("");
  const nameInput = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const actionButton = useRef<HTMLButtonElement | null>(null);
  const restoreAction = useRef(false);
  function cancel() { setEditing(null); setDeleting(null); setError(""); actionButton.current?.focus({preventScroll: true}); }
  useLayoutEffect(() => { if (editing != null) { nameInput.current?.focus({preventScroll: true}); nameInput.current?.select(); } }, [editing]);
  useLayoutEffect(() => {
    if (restoreAction.current && !disabled && editing == null && deleting == null) {
      restoreAction.current = false;
      (actionButton.current?.isConnected ? actionButton.current : list.current)?.focus({ preventScroll: true });
    }
  }, [disabled, editing, deleting]);

  async function run(operation: () => Promise<void>) {
    if (disabled) return;
    onWorking(true);
    setError("");
    try {
      await operation();
      setEditing(null);
      setDeleting(null);
      // Restore after the parent re-enables controls and the inline form is removed.
      restoreAction.current = editing != null || deleting != null;
    } catch (e) {
      setError(e instanceof Error ? e.message : "操作失败，请重试");
    } finally {
      onWorking(false);
    }
  }

  return <div ref={list} tabIndex={-1} className="reader-conversations" aria-label="历史会话列表" onKeyDown={e => { if (e.key === "Escape" && (editing != null || deleting != null)) { e.stopPropagation(); cancel(); } }}>
    {conversations.length ? <ul>{conversations.map(conversation => <li key={conversation.id}>
      <div className="conversation-row" data-current={conversation.id === selected}>
        <button type="button" className="conversation-select" disabled={disabled}
          aria-current={conversation.id === selected ? "true" : undefined}
          onClick={() => void run(() => onSelect(conversation.id))}>
          <span className="conversation-indicator" aria-hidden="true">{conversation.id === selected && <Check size={16} />}</span>
          <span className="conversation-copy"><span className="conversation-name">{conversation.title}</span>
            <time dateTime={conversation.updatedAt}>{new Date(conversation.updatedAt).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</time>
          </span>
        </button>
        <div className="conversation-actions">
          <ReaderTooltip label="重命名"><button type="button" aria-label={`重命名「${conversation.title}」`} disabled={disabled}
            onClick={e => { actionButton.current = e.currentTarget; setTitle(conversation.title); setEditing(conversation.id); setDeleting(null); setError(""); }}><Pencil size={16} /></button></ReaderTooltip>
          <ReaderTooltip label="删除对话"><button type="button" className="conversation-remove" aria-label={`删除「${conversation.title}」`} disabled={disabled}
            onClick={e => { actionButton.current = e.currentTarget; setDeleting(conversation.id); setEditing(null); setError(""); }}><Trash2 size={16} /></button></ReaderTooltip>
        </div>
      </div>
      {editing === conversation.id && <form className="conversation-rename" onSubmit={e => { e.preventDefault(); void run(() => onRename(conversation.id, title.trim())); }}>
        <input ref={nameInput} aria-label="对话名称" placeholder="对话名称" value={title} maxLength={80} disabled={disabled} onChange={e => setTitle(e.target.value)} />
        <ReaderTooltip label="保存名称"><button type="submit" disabled={disabled || !title.trim()} aria-label="保存名称"><Check size={16} /></button></ReaderTooltip>
        <ReaderTooltip label="取消"><button type="button" disabled={disabled} aria-label="取消重命名" onClick={cancel}><X size={16} /></button></ReaderTooltip>
      </form>}
      {deleting === conversation.id && <div className="conversation-delete" role="group" aria-label={`确认删除「${conversation.title}」`}>
        <p>删除对话？笔记会保留。</p>
        <div><button type="button" disabled={disabled} onClick={cancel}>取消</button>
          <button type="button" className="conversation-delete-confirm" disabled={disabled} onClick={() => void run(() => onDelete(conversation.id))}>删除对话</button></div>
      </div>}
    </li>)}</ul> : <p className="conversation-empty">暂无对话</p>}
    {error && <p role="alert" className="conversation-error">{error}</p>}
  </div>;
}
