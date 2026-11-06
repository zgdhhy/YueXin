"use client";

import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { clamp, clampFloating, DEFAULT_PANEL, dockLimit, effectiveMode, PANEL_STORAGE_KEY, panelSizePreferences, parsePanelPreferences, resizeFloating, type Bounds, type PanelMode, type PanelPreferences, type PanelViewport, type ResizeEdge } from "@/lib/reader/reader-panel-layout";
import { scrollReadingBy } from "@/lib/reader/reader-scroll";

type Anchor = { element: HTMLElement; top: number };
function readingAnchor(top: number): Anchor | null {
  const blocks = document.querySelectorAll<HTMLElement>(".reader-copy .reader-heading, .reader-copy .reader-overview, .reader-copy .article :is(h2,h3,p,li,pre,table,figure), .reader-copy .reader-next");
  for (const element of blocks) {
    const rect = element.getBoundingClientRect();
    if (rect.height && rect.bottom > top + 24 && rect.top < innerHeight) return { element, top: rect.top };
  }
  return null;
}

export function useReaderPanel() {
  const shell = useRef<HTMLDivElement>(null);
  const [preferences, setPreferences] = useState<PanelPreferences>({ ...DEFAULT_PANEL });
  const preferencesRef = useRef(preferences);
  preferencesRef.current = preferences;
  const [fullscreen, setFullscreen] = useState(false);
  const [viewport, setViewport] = useState<PanelViewport>({ width: 1440, height: 900, top: 108, shellLeft: 40, shellWidth: 1304 });
  const viewportRef = useRef(viewport);
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ kind: "move" | "dock" | ResizeEdge; x: number; y: number; bounds: Bounds; width: number; mode: PanelMode; pointerId: number; active: boolean } | null>(null);
  const pendingAnchor = useRef<Anchor | null>(null);
  const lastAnchor = useRef<Anchor | null>(null);
  const mode = effectiveMode(fullscreen ? "fullscreen" : preferences.mode, viewport);
  const dockWidth = clamp(preferences.dockWidth, 360, dockLimit(viewport));
  const floating = clampFloating(preferences.floating, viewport);
  const preserveReading = () => { pendingAnchor.current ??= readingAnchor(viewport.top); };
  const persist = (next = preferencesRef.current) => {
    try { localStorage.setItem(PANEL_STORAGE_KEY, JSON.stringify(panelSizePreferences(next))); } catch { /* Private/storage-disabled browsers retain in-memory sizes. */ }
  };

  useLayoutEffect(() => {
    try { setPreferences(parsePanelPreferences(localStorage.getItem(PANEL_STORAGE_KEY))); } catch { /* Use defaults. */ }
    const measure = () => {
      const rect = shell.current?.getBoundingClientRect();
      const header = document.querySelector(".room-header")?.getBoundingClientRect();
      const next = { width: innerWidth, height: innerHeight, top: Math.max(16, (header?.bottom ?? 92) + 16), shellLeft: rect?.left ?? 40, shellWidth: rect?.width ?? innerWidth - 136 };
      if (Object.keys(next).every(k => next[k as keyof PanelViewport] === viewportRef.current[k as keyof PanelViewport])) return;
      pendingAnchor.current ??= lastAnchor.current;
      viewportRef.current = next;
      setViewport(next);
    };
    measure();
    const observer = new ResizeObserver(measure);
    if (shell.current) observer.observe(shell.current);
    window.addEventListener("resize", measure);
    return () => { observer.disconnect(); window.removeEventListener("resize", measure); };
  }, []);
  useLayoutEffect(() => {
    const anchor = pendingAnchor.current;
    pendingAnchor.current = null;
    if (anchor?.element.isConnected) scrollReadingBy(anchor.element.getBoundingClientRect().top - anchor.top);
    lastAnchor.current = readingAnchor(viewport.top);
    window.dispatchEvent(new Event("reader-scroll"));
  });
  useEffect(() => {
    const rememberAnchor = () => { lastAnchor.current = readingAnchor(viewport.top); };
    window.addEventListener("scroll", rememberAnchor, { passive: true });
    return () => window.removeEventListener("scroll", rememberAnchor);
  }, [viewport.top]);

  function changeMode(next: PanelMode) {
    preserveReading();
    if (next === "fullscreen") setFullscreen(true);
    else {
      setFullscreen(false);
      const updated = { ...preferencesRef.current, mode: next };
      setPreferences(updated);
      persist(updated);
    }
  }
  function resetForOpen() {
    preserveReading();
    setFullscreen(false);
    const next = parsePanelPreferences(JSON.stringify(panelSizePreferences(preferencesRef.current)));
    preferencesRef.current = next;
    setPreferences(next);
  }
  function resizeDock(width: number) {
    preserveReading();
    const updated = { ...preferencesRef.current, dockWidth: clamp(width, 360, dockLimit(viewport)) };
    preferencesRef.current = updated;
    setPreferences(updated);
    return updated;
  }
  function startDrag(event: ReactPointerEvent<HTMLElement>, kind: "move" | "dock" | ResizeEdge) {
    if (event.button !== 0 || viewport.width <= 639) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    let bounds = floating;
    if (kind === "move" && mode !== "floating") {
      const rect = event.currentTarget.closest(".reader-popup")!.getBoundingClientRect();
      // Keep the grabbed point under the pointer when restoring the floating size.
      bounds = clampFloating({ ...floating, x: event.clientX - (event.clientX - rect.left) / rect.width * floating.width, y: event.clientY - (event.clientY - rect.top) }, viewport);
    }
    drag.current = { kind, x: event.clientX, y: event.clientY, bounds, width: dockWidth, mode, pointerId: event.pointerId, active: kind !== "move" };
    setDragging(kind !== "move");
  }
  function moveDrag(event: ReactPointerEvent<HTMLElement>) {
    const d = drag.current;
    if (!d || d.pointerId !== event.pointerId) return;
    const dx = event.clientX - d.x, dy = event.clientY - d.y;
    if (!d.active) {
      if (Math.hypot(dx, dy) < 4) return;
      d.active = true;
      preserveReading();
      setFullscreen(false);
      setDragging(true);
    }
    if (d.kind === "dock") resizeDock(d.width + (d.mode === "left" ? dx : -dx));
    else {
      const bounds = d.kind === "move" ? clampFloating({ ...d.bounds, x: d.bounds.x + dx, y: d.bounds.y + dy }, viewport) : resizeFloating(d.bounds, d.kind, dx, dy, viewport);
      const next = { ...preferencesRef.current, ...(d.kind === "move" ? { mode: "floating" as const } : {}), floating: bounds };
      preferencesRef.current = next;
      setPreferences(next);
    }
  }
  function endDrag(event: ReactPointerEvent<HTMLElement>) {
    if (!drag.current || drag.current.pointerId !== event.pointerId) return;
    drag.current = null;
    setDragging(false);
    persist();
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }
  return { shell, preferences, mode, viewport, dockWidth, floating, dragging, preserveReading, resetForOpen, changeMode, exitFullscreen: () => { preserveReading(); setFullscreen(false); }, resizeDock: (width: number) => persist(resizeDock(width)), startDrag, pointerEvents: { onPointerMove: moveDrag, onPointerUp: endDrag, onPointerCancel: endDrag, onLostPointerCapture: endDrag } };
}
