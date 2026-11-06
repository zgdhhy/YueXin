"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";

/** Short action hints shared by icon controls; keep them inside the viewport. */
export function ReaderTooltip({ label, children, className = "" }: { label: string; children: ReactNode; className?: string }) {
  const id = useId(), anchor = useRef<HTMLSpanElement>(null), bubble = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<CSSProperties>({ visibility: "hidden" });
  const [above, setAbove] = useState(true);
  const show = () => {
    document.dispatchEvent(new CustomEvent("reader-tooltip-open", { detail: id }));
    setOpen(true);
  };
  useLayoutEffect(() => {
    if (!open || !anchor.current || !bubble.current) return;
    const rect = anchor.current.getBoundingClientRect(), bounds = bubble.current.getBoundingClientRect();
    const left = Math.max(8, Math.min(innerWidth - bounds.width - 8, rect.left + rect.width / 2 - bounds.width / 2));
    const top = rect.top >= bounds.height + 12;
    setAbove(top);
    setPosition({ left, top: top ? rect.top - bounds.height - 9 : rect.bottom + 9, "--tooltip-arrow-x": `${Math.max(8, Math.min(bounds.width - 8, rect.left + rect.width / 2 - left))}px` } as CSSProperties);
    const control = anchor.current.querySelector("button,input");
    const previous = control?.getAttribute("aria-describedby");
    control?.setAttribute("aria-describedby", [previous, id].filter(Boolean).join(" "));
    return () => { if (previous) control?.setAttribute("aria-describedby", previous); else control?.removeAttribute("aria-describedby"); };
  }, [open, label, id]);
  useEffect(() => {
    if (!open) return;
    const close = () => { setOpen(false); setPosition({ visibility: "hidden" }); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") close(); };
    const anotherHint = (event: Event) => { if ((event as CustomEvent<string>).detail !== id) close(); };
    document.addEventListener("reader-tooltip-open", anotherHint);
    document.addEventListener("scroll", close, true);
    document.addEventListener("pointerdown", close, true);
    document.addEventListener("keydown", escape);
    window.addEventListener("resize", close);
    return () => { document.removeEventListener("reader-tooltip-open", anotherHint); document.removeEventListener("scroll", close, true); document.removeEventListener("pointerdown", close, true); document.removeEventListener("keydown", escape); window.removeEventListener("resize", close); };
  }, [open, id]);
  return <span ref={anchor} className={`reader-tooltip-anchor ${className}`} onPointerEnter={show} onPointerLeave={() => { setOpen(false); setPosition({ visibility: "hidden" }); }} onFocusCapture={show} onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) { setOpen(false); setPosition({ visibility: "hidden" }); } }}>
    {children}
    {open && createPortal(<span ref={bubble} id={id} role="tooltip" className="reader-tooltip" data-placement={above ? "above" : "below"} style={position}>{label}</span>, document.body)}
  </span>;
}
