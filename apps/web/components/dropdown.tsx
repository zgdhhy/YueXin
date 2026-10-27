"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";

export interface DropdownOption {
  value: string;
  label: React.ReactNode;
  text: string;
  group?: string;
  disabled?: boolean;
}

/** Popover 位于顶层，也能在 dialog 内展开；所有选择器共用键盘与视觉行为。 */
export function Dropdown({ options, value, onChange, disabled, label, id, className = "" }: {
  options: DropdownOption[];
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  label?: React.ReactNode;
  id?: string;
  className?: string;
}) {
  const uid = useId();
  const listId = `${uid}-options`;
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);
  const search = useRef("");
  const searchAt = useRef(0);

  useEffect(() => {
    const el = panel.current;
    if (!open || !el?.isConnected) return;
    const position = () => {
      const r = trigger.current!.getBoundingClientRect();
      const below = window.innerHeight - r.bottom - 12;
      const above = r.top - 12;
      const up = below < 220 && above > below;
      Object.assign(el.style, {
        left: `${Math.max(8, Math.min(r.left, window.innerWidth - Math.min(r.width, window.innerWidth - 16) - 8))}px`,
        width: `${Math.min(r.width, window.innerWidth - 16)}px`,
        maxHeight: `${Math.min(320, Math.max(80, up ? above : below))}px`,
        top: up ? "auto" : `${r.bottom + 6}px`,
        bottom: up ? `${window.innerHeight - r.top + 6}px` : "auto",
      });
    };
    position();
    el.showPopover();
    const buttons = Array.from(el.querySelectorAll<HTMLButtonElement>("[role=option]:not(:disabled)"));
    (buttons.find((b) => b.getAttribute("aria-selected") === "true") ?? buttons[0])?.focus();
    window.addEventListener("resize", position);
    window.addEventListener("scroll", position, true);
    return () => {
      if (el.isConnected) el.hidePopover();
      window.removeEventListener("resize", position);
      window.removeEventListener("scroll", position, true);
    };
  }, [open]);

  const close = () => { setOpen(false); trigger.current?.focus(); };
  return (
    <div className="relative min-w-0">
      <button ref={trigger} id={id ?? uid} type="button" disabled={disabled} aria-haspopup="listbox" aria-expanded={open}
        aria-controls={listId} onClick={() => setOpen(!open)}
        onKeyDown={(e) => { if (["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) { e.preventDefault(); setOpen(true); } }}
        className={`flex min-h-10 w-full items-center gap-2.5 rounded-lg bg-white px-3 py-2 text-left text-sm text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 transition hover:ring-slate-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:opacity-50 ${className}`}>
        <span className="min-w-0 flex-1 truncate">{label ?? selected?.label ?? "请选择"}</span>
        <ChevronsUpDown className="h-4 w-4 shrink-0 text-slate-400" />
      </button>
      <div ref={panel} id={listId} popover="auto" role="listbox" aria-labelledby={id ?? uid}
        onToggle={(e) => { if (e.newState === "closed") setOpen(false); }}
        onKeyDown={(e) => {
          const buttons = Array.from(panel.current!.querySelectorAll<HTMLButtonElement>("[role=option]:not(:disabled)"));
          const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
          if (e.key === "Escape" || e.key === "Tab") { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); } close(); return; }
          if (["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) {
            e.preventDefault();
            const next = e.key === "Home" ? 0 : e.key === "End" ? buttons.length - 1 : (index + (e.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length;
            buttons[next]?.focus();
          } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && e.key !== " ") {
            e.preventDefault();
            search.current = Date.now() - searchAt.current > 700 ? e.key : search.current + e.key;
            searchAt.current = Date.now();
            buttons.find((b) => b.dataset.text?.toLowerCase().startsWith(search.current.toLowerCase()))?.focus();
          }
        }}
        className="fixed m-0 overflow-y-auto rounded-xl border-0 bg-white p-1.5 text-sm shadow-xl ring-1 ring-slate-200">
        {options.map((o, i) => (
          <div key={o.value}>
            {o.group && o.group !== options[i - 1]?.group && <div className="mt-1 border-t border-slate-100 px-2.5 pt-2 pb-1 text-xs font-medium text-slate-400">{o.group}</div>}
            <button type="button" role="option" aria-selected={o.value === value} disabled={o.disabled} data-text={o.text}
              onClick={() => { onChange(o.value); close(); }}
              className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition outline-none focus:bg-slate-100 disabled:opacity-40 ${o.value === value ? "bg-indigo-50 text-indigo-900" : "text-slate-700 hover:bg-slate-50"}`}>
              <span className="min-w-0 flex-1">{o.label}</span>
              {o.value === value && <Check className="h-4 w-4 shrink-0 text-indigo-600" />}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
