"use client";

import type { readingModelsAction } from "@/app/(site)/actions";
import { Check, ModelChoice } from "../reading-icons";
import { createPortal } from "react-dom";
import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";

export type ReadingModelOption = Awaited<ReturnType<typeof readingModelsAction>>[number];


export function ReaderModelSelect({ models, value, onChange, disabled, compact = false }: {
  models: ReadingModelOption[]; value: number | null; onChange: (value: number | null) => void; disabled?: boolean; compact?: boolean;
}) {
  const selected = models.find(model => model.id === value) ?? models.find(model => model.isDefault) ?? models[0];
  const [open, setOpen] = useState(false);

  const [position, setPosition] = useState<CSSProperties>({ visibility: "hidden" });
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);

  const id = useId();
  const icon = (model?: ReadingModelOption) => model?.icon ? <img src={model.icon} alt="" width={20} height={20}/> : <ModelChoice size={20}/>;
  useEffect(() => {
    function outside(event: PointerEvent) {
      if (!trigger.current?.contains(event.target as Node) && !menu.current?.contains(event.target as Node)) { setOpen(false); }
    }
    function dismiss(event: Event) {
      if (event.target instanceof Node && menu.current?.contains(event.target)) { return; }
      setOpen(false);
    }
    document.addEventListener("pointerdown", outside);
    document.addEventListener("scroll", dismiss, true);
    window.addEventListener("resize", dismiss);
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("scroll", dismiss, true); window.removeEventListener("resize", dismiss); };
  }, []);
  useLayoutEffect(() => {
    if (!open || !trigger.current || !menu.current) return;
    const anchor = trigger.current.getBoundingClientRect();
    const width = Math.min(264, innerWidth - 24);
    const above = anchor.top - 20, below = innerHeight - anchor.bottom - 20;
    const height = Math.min(menu.current.scrollHeight, 320, Math.max(above, below));
    const top = above >= height || above > below ? anchor.top - height - 8 : anchor.bottom + 8;
    setPosition({ left: Math.max(12, Math.min(innerWidth - width - 12, compact ? anchor.right - width : anchor.left)), top: Math.max(12, top), width, maxHeight: height });
  }, [open, models.length, compact]);
  function keyboard(event: KeyboardEvent) {
    if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setOpen(false); trigger.current?.focus({ preventScroll: true }); }
    if (event.key === "ArrowDown" || event.key === "ArrowUp" || event.key === "Home" || event.key === "End") {
      event.preventDefault(); setOpen(true);
      requestAnimationFrame(() => {
        const rows = Array.from(menu.current?.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]') ?? []);
        const current = rows.indexOf(document.activeElement as HTMLButtonElement);
        const next = event.key === "Home" ? 0 : event.key === "End" ? rows.length - 1 : (current + (event.key === "ArrowDown" ? 1 : rows.length - 1) + rows.length) % rows.length;
        rows[next]?.focus({ preventScroll: true }); rows[next]?.scrollIntoView({ block: "nearest" });
      });
    }
    if (event.key === "Tab") { setOpen(false); trigger.current?.focus({ preventScroll: true }); }
  }
  return <div className={`reader-model-select${compact ? " is-compact" : ""}`}>
    <button ref={trigger} type="button" className="reader-model-trigger" aria-label="选择模型" aria-expanded={open} aria-controls={open ? id : undefined} aria-haspopup="menu" disabled={disabled || !models.length} onKeyDown={keyboard}
      onClick={() => { setPosition({ visibility: "hidden" }); setOpen(!open); }}>{icon(selected)}<span>{selected?.name || selected?.model || "无可用模型"}</span><svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true"><path d="m3 4.5 3 3 3-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg></button>
    {open && createPortal(<div ref={menu} id={id} className="reader-model-menu reader-model-floating" role="menu" aria-label="选择模型" style={position} onKeyDown={keyboard} onPointerDown={event => event.preventDefault()}>
      {models.map(model => <button key={model.id} type="button" role="menuitemradio" aria-label={`${model.provider} / ${model.name || model.model}`} aria-checked={selected?.id === model.id}
          onClick={() => { onChange(model.id); setOpen(false); trigger.current?.focus({ preventScroll: true }); }}>
        {icon(model)}<span>{model.name || model.model}</span><span className="reader-model-check">{selected?.id === model.id && <Check size={16}/>}</span>
      </button>)}
    </div>, document.body)}
  </div>;
}

