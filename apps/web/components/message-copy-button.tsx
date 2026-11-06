"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy } from "./reading-icons";

async function copyText(text: string) {
  try {
    if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(text); return; }
  } catch { /* Local HTTP pages and denied clipboard permissions can use a user-initiated copy. */ }
  const active = document.activeElement as HTMLElement | null;
  const selection = window.getSelection();
  const ranges = selection ? Array.from({ length: selection.rangeCount }, (_, index) => selection.getRangeAt(index).cloneRange()) : [];
  const input = document.createElement("textarea");
  input.value = text;
  input.tabIndex = -1;
  input.setAttribute("data-clipboard-fallback", "");
  input.style.cssText = "position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;pointer-events:none";
  document.body.append(input);
  try {
    input.focus({ preventScroll: true });
    input.select();
    if (!document.execCommand("copy")) throw new Error("Copy failed");
  } finally {
    input.remove();
    active?.focus({ preventScroll: true });
    if (selection) { selection.removeAllRanges(); ranges.forEach(range => selection.addRange(range)); }
  }
}

export function MessageCopyButton({ text, label, iconOnly = false }: { text: string; label: string; iconOnly?: boolean }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; clearTimeout(timer.current); }; }, []);
  const feedback = state === "copied" ? "已复制" : state === "failed" ? "复制失败，请重试" : label;
  return <button type="button" className={`reader-message-copy${iconOnly ? " reader-message-copy-icon" : ""}`} aria-label={feedback} title={feedback} data-state={state} onClick={async () => {
    let next: "copied" | "failed" = "copied";
    try { await copyText(text); } catch { next = "failed"; }
    if (!alive.current) return;
    setState(next);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setState("idle"), 2000);
  }}>
    {state === "copied" ? <Check size={15}/> : <Copy size={15}/>}
    {!iconOnly && <span>{state === "idle" ? "复制" : state === "copied" ? "已复制" : "复制失败"}</span>}
    <span className="sr-only" role="status">{state === "idle" ? "" : feedback}</span>
  </button>;
}
