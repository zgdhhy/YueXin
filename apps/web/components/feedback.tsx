"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CheckCircle2, X, XCircle } from "lucide-react";
import { buttonCls } from "./ui";

/** 原生 dialog 管理焦点，但内容、按钮和遮罩完全使用站内样式。 */
export function useConfirmSubmit(message?: string) {
  const [target, setTarget] = useState<HTMLButtonElement | null>(null);
  const approved = useRef(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const id = useId();
  useEffect(() => { if (target) dialog.current?.showModal(); }, [target]);
  const close = () => { dialog.current?.close(); setTarget(null); target?.focus(); };
  return {
    onClick: (e: React.MouseEvent<HTMLButtonElement>) => {
      if (approved.current) { approved.current = false; return; }
      if (!message) return;
      e.preventDefault();
      setTarget(e.currentTarget);
    },
    confirmation: target && (
      <dialog ref={dialog} role="alertdialog" aria-labelledby={id} aria-describedby={`${id}-description`} onCancel={(e) => { e.preventDefault(); close(); }}
        className="m-auto w-[calc(100vw-2rem)] max-w-md rounded-2xl border-0 bg-white p-6 shadow-2xl ring-1 ring-slate-200 backdrop:bg-slate-900/40 backdrop:backdrop-blur-[2px]">
        <h2 id={id} className="text-lg font-semibold text-slate-900">确认操作</h2>
        <p id={`${id}-description`} className="mt-3 text-sm leading-relaxed whitespace-pre-wrap text-slate-600">{message}</p>
        <div className="mt-6 flex justify-end gap-2">
          <button type="button" autoFocus className={buttonCls("secondary")} onClick={close}>取消</button>
          <button type="button" className={buttonCls("primary")} onClick={() => {
            const button = target;
            close();
            approved.current = true;
            button.click();
          }}>确认</button>
        </div>
      </dialog>
    ),
  };
}

/** 通知无论成功或失败都在 1.5 秒后自动关闭；需要用户确认的操作使用确认弹窗，不用通知。 */
export const NOTICE_MS = 1500;

/** 非模态顶层提示，保证配置弹窗打开时也可见、可操作。位置只随屏幕宽度变化：桌面右上角，窄屏底部（避开弹窗底部按钮）。 */
export function Notice({ message, onClose, tone }: { message: string; onClose: () => void; tone?: "success" | "error" }) {
  const ref = useRef<HTMLDivElement>(null);
  const [host, setHost] = useState<HTMLElement | null>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => { const timer = setTimeout(() => closeRef.current(), NOTICE_MS); return () => clearTimeout(timer); }, [message]);
  const bad = tone ? tone === "error" : /失败|无效|^请|不存在|不支持|错误|无法|过期/.test(message);
  useEffect(() => {
    const sync = () => setHost(document.querySelector<HTMLDialogElement>("dialog[open]") ?? document.body);
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["open"] });
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const raise = () => {
      if (!el.isConnected) return;
      // dialog.showModal() 会进入顶层；在它之后重新展示提示。
      el.hidePopover();
      el.showPopover();
    };
    raise();
    const observer = new MutationObserver(raise);
    document.querySelectorAll("dialog").forEach((d) => observer.observe(d, { attributes: true, attributeFilter: ["open"] }));
    return () => { observer.disconnect(); if (el.isConnected) el.hidePopover(); };
  }, [message, host]);
  if (!host) return null;
  return createPortal(
    <div ref={ref} popover="manual" role={bad ? "alert" : "status"}
      className="pointer-events-none fixed top-auto right-5 bottom-[calc(92px+env(safe-area-inset-bottom))] left-auto m-0 lg:top-5 lg:bottom-auto w-96 max-w-[calc(100vw-2.5rem)] rounded-xl border-0 bg-white p-4 shadow-xl ring-1 ring-slate-200">
      <div className="flex items-start gap-3">
        {bad ? <XCircle className="h-5 w-5 shrink-0 text-red-500" /> : <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-500" />}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-900">{bad ? "操作未完成" : "操作成功"}</p>
          <p className="mt-1 max-h-64 overflow-auto text-sm whitespace-pre-wrap break-words text-slate-600">{message}</p>
        </div>
        <button type="button" aria-label="关闭通知" onClick={onClose} className="pointer-events-auto rounded p-1 text-slate-400 hover:bg-slate-100"><X className="h-4 w-4" /></button>
      </div>
    </div>, host
  );
}
