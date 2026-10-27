"use client";

import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { ArrowLeft, Loader2, Search, X } from "lucide-react";
import type { WorkspaceData } from "@/lib/model-workspace";
import type { RemoteModel } from "@paper/core";
import { cn } from "@/lib/cn";

export interface ApiResult {
  data?: WorkspaceData;
  selectedId?: number;
  models?: RemoteModel[];
  result?: { latencyMs: number; text: string };
  pending?: boolean;
  addedModelIds?: number[];
}
export class ApiError extends Error {
  constructor(message: string, public fields: Record<string, string> = {}, public data?: WorkspaceData) { super(message); }
}
export async function request(command?: object, signal?: AbortSignal): Promise<ApiResult> {
  const res = await fetch("/api/admin/models", { method: command ? "POST" : "GET", headers: command ? { "Content-Type": "application/json" } : undefined, body: command ? JSON.stringify(command) : undefined, signal, cache: "no-store" });
  if (res.redirected || res.status === 401) throw new Error("登录已过期，请刷新页面重新登录");
  const json = await res.json();
  if (!res.ok) throw new ApiError(json.error ?? "操作失败，请重试", json.fields, json.data);
  return json;
}
export type Act = (command: object, message?: string, onError?: (error: ApiError) => void) => Promise<ApiResult | null>;

export class DraftStore {
  private values = new Map<string, unknown>();
  private listeners = new Map<string, Set<() => void>>();
  get<T>(key: string) { return this.values.get(key) as T | undefined; }
  has(key: string) { return this.values.has(key); }
  set<T>(key: string, value: T) { this.values.set(key, value); this.listeners.get(key)?.forEach((f) => f()); }
  delete(key: string) { this.values.delete(key); this.listeners.get(key)?.forEach((f) => f()); }
  subscribe(key: string, listener: () => void) {
    const list = this.listeners.get(key) ?? new Set(); list.add(listener); this.listeners.set(key, list);
    return () => { list.delete(listener); };
  }
}
export function useDraft<T>(store: DraftStore, key: string, initial: () => T) {
  const initialValue = useRef<T | null>(null);
  if (initialValue.current === null) initialValue.current = initial();
  const draft = useSyncExternalStore((cb) => store.subscribe(key, cb), () => store.get<T>(key) ?? initialValue.current!, () => initialValue.current!);
  const [resumed] = useState(() => store.has(key));
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const setDraft = (next: T | ((current: T) => T)) => store.set(key, typeof next === "function" ? (next as (current: T) => T)(store.get<T>(key) ?? initialValue.current!) : next);
  const discard = () => { initialValue.current = initial(); store.delete(key); };
  return { draft, setDraft, discard, resumed, alive };
}
export function DraftHint({ resumed, onDiscard }: { resumed: boolean; onDiscard: () => void }) {
  return resumed ? <div className="mw-draft"><span>已恢复未保存草稿，继续编辑</span><button type="button" onClick={onDiscard}>放弃草稿</button></div> : null;
}
export function SearchInput({ value, onChange, placeholder, label = placeholder, autoFocus }: { value: string; onChange: (value: string) => void; placeholder: string; label?: string; autoFocus?: boolean }) {
  return <div className="mw-search"><Search aria-hidden="true" size={17} /><input aria-label={label} autoFocus={autoFocus} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />{value && <button type="button" aria-label="清空搜索" onClick={() => onChange("")}><X size={15} /></button>}</div>;
}

export function Action({ children, tone = "plain", busy, className = "", ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { tone?: "plain" | "primary" | "danger"; busy?: boolean }) {
  return <button type="button" {...props} disabled={busy || props.disabled} className={`mw-action ${tone === "primary" ? "mw-primary" : tone === "danger" ? "mw-danger" : ""} ${className}`}>
    {busy && <Loader2 size={15} className="animate-spin" />}{children}
  </button>;
}
export function IconButton({ label, children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return <button type="button" {...props} title={label} aria-label={label} className={`mw-icon ${props.className ?? ""}`}>{children}</button>;
}
export function FormField({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return <label className="block space-y-2"><span className="text-sm font-medium text-slate-700">{label}</span>{children}{hint && <span className="block text-[13px] leading-relaxed text-slate-400">{hint}</span>}</label>;
}
export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`mw-input ${props.className ?? ""}`} />;
}

/**
 * 模型配置页唯一的弹窗外框：居中显示，标题栏 + 可滚动内容 + 底部操作（次要在左、主要在右）。
 * size="sm" 用于确认操作；tall 固定高度，适合会随搜索变化的列表，避免弹窗跳动。
 * footerStart 放在底部左侧，用于停用、删除等次要的危险操作。
 * 所有关闭路径同步关闭 dialog，再卸载内容；不等待路由或网络。
 */
export function Dialog({ title, subtitle, onClose, onBack, children, footer, footerStart, size = "md", tall }: {
  title: string; subtitle?: string; onClose: () => void; onBack?: () => void; children: React.ReactNode; footer?: React.ReactNode; footerStart?: React.ReactNode; size?: "md" | "sm"; tall?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const titleId = useId();
  useEffect(() => {
    const d = ref.current!;
    const previous = document.activeElement as HTMLElement | null;
    d.showModal();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { d.close(); document.body.style.overflow = overflow; previous?.focus(); };
  }, []);
  const close = () => { ref.current?.close(); closeRef.current(); };
  return <dialog ref={ref} role={size === "sm" ? "alertdialog" : undefined} aria-labelledby={titleId} className={cn("mw-dialog", size === "sm" && "mw-dialog-sm", tall && "mw-dialog-tall")} onCancel={(e) => { e.preventDefault(); close(); }}
    onPointerDown={(e) => { if (e.target === ref.current) { const r = ref.current!.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) close(); } }}>
    <div className="mw-dialog-frame">
      <header className="mw-dialog-header">
        {onBack && <IconButton label="返回" onClick={onBack}><ArrowLeft size={18} /></IconButton>}
        <div className="min-w-0 flex-1"><h2 id={titleId}>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>
        <IconButton label="关闭弹窗" onClick={close}><X size={18} /></IconButton>
      </header>
      <div className="mw-dialog-body">{children}</div>
      {footer && <footer className="mw-dialog-footer">{footerStart && <div className="mw-dialog-footer-start">{footerStart}</div>}{footer}</footer>}
    </div>
  </dialog>;
}

