"use client";

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { MoreHorizontal, PanelLeft, PanelRight, Maximize, Minimize, PanelsTopLeft, X } from "../reading-icons";
import { dockLimit, type PanelMode, type PanelView, type ResizeEdge } from "@/lib/reader/reader-panel-layout";
import type { useReaderPanel } from "./use-reader-panel";

type PanelController = ReturnType<typeof useReaderPanel>;
const modes = [
  { key: "left", label: "停靠在左侧", Icon: PanelLeft },
  { key: "right", label: "停靠在右侧", Icon: PanelRight },
  { key: "floating", label: "浮动面板", Icon: PanelsTopLeft },
  { key: "fullscreen", label: "全屏", Icon: Maximize },
] as const;
const resizeEdges: ResizeEdge[] = ["n", "s", "e", "w", "ne", "nw", "se", "sw"];
const CLOSE_DURATION = 310;
/** Split the original easing at 90ms; stretch only its last 90ms to 220ms. */
function closeFrames(from: string, to: string): Keyframe[] {
  const start = new DOMMatrix(from === "none" ? undefined : from).toFloat64Array();
  const end = new DOMMatrix(to).toFloat64Array();
  const halfway = new DOMMatrix(Array.from(start, (value, index) => value + (end[index] - value) * .9613825478)).toString();
  return [
    { transform: from, offset: 0, easing: "cubic-bezier(.291276,.688583,.512435,.92133)" },
    { transform: halfway, offset: 90 / CLOSE_DURATION, easing: "cubic-bezier(.248948,1,.567349,1)" },
    { transform: to, offset: 1 },
  ];
}
export function ReaderPanel({ view, closing, onClosed, informationLabel, tools, origin, controller: c, onClose, children }: {
  view: PanelView | null; closing: boolean; onClosed: () => void; informationLabel: string; tools: ReactNode; origin: { x: number; y: number }; controller: PanelController; onClose: () => void; children: ReactNode;
}) {
  const titles = { qa: "AI 助手", notes: "笔记", resources: informationLabel };
  const ref = useRef<HTMLElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuButton = useRef<HTMLButtonElement>(null);
  const [menu, setMenu] = useState(false);
  const wasOpen = useRef(false);
  const wasClosing = useRef(false);
  const motion = useRef<Animation | null>(null);
  const details = useRef<Animation[]>([]);
  const closedCallback = useRef(onClosed);
  closedCallback.current = onClosed;
  const compact = dockLimit(c.viewport) < 360;
  useLayoutEffect(() => {
    const opening = !!view && (!wasOpen.current || wasClosing.current && !closing);
    wasOpen.current = !!view;
    wasClosing.current = closing;
    const element = frame.current;
    if (!element || !ref.current) return;
    // Sample before cancelling so a quick reversal continues from the visible size.
    const current = getComputedStyle(element);
    const interrupted = motion.current?.playState === "running" || motion.current?.playState === "paused";
    const initial = { opacity: current.opacity, transform: current.transform };
    const contentElements = [...(frame.current?.children ?? [])];
    const revealElements = [...contentElements, ...ref.current.querySelectorAll<HTMLElement>(".reader-tools button")];
    const visibleDetails = revealElements.map(item => ({ opacity: getComputedStyle(item).opacity, transform: getComputedStyle(item).transform }));
    const activeButton = ref.current.querySelector<HTMLElement>(`[data-reader-trigger="${view}"]`)?.getBoundingClientRect();
    const toolButtons = [...ref.current.querySelectorAll<HTMLElement>(".reader-tools button")];
    const toolPositions = toolButtons.map(button => button.getBoundingClientRect());
    // Measure the actual resting layout, rather than duplicating its CSS coordinates.
    const homePositions: DOMRect[] = [];
    if (closing) {
      const rail = ref.current.querySelector<HTMLElement>(".reader-tools");
      if (rail) {
        const measure = rail.cloneNode(true) as HTMLElement;
        measure.style.visibility = "hidden";
        measure.inert = true;
        measure.setAttribute("aria-hidden", "true");
        ref.current.parentElement!.appendChild(measure);
        homePositions.push(...[...measure.querySelectorAll("button")].map(button => button.getBoundingClientRect()));
        measure.remove();
      }
    }
    if (motion.current) { motion.current.onfinish = null; motion.current.cancel(); motion.current = null; }
    details.current.forEach(animation => animation.cancel());
    details.current = [];
    if (!view) return;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      if (closing) closedCallback.current();
      return;
    }
    if (!opening && !closing) return;
    const rect = element.getBoundingClientRect();
    const activeIndex = toolButtons.findIndex(button => button.dataset.readerTrigger === view);
    const homeButton = homePositions[activeIndex] ?? activeButton;
    // The window and selected tool converge at the same point on the same timeline.
    const target = closing && homeButton ? { x: homeButton.x + homeButton.width / 2, y: homeButton.y + homeButton.height / 2 } : origin;
    const dx = target.x - rect.left - element.offsetWidth * .08 / 2;
    const dy = target.y - rect.top - element.offsetHeight * .04 / 2;
    const collapsed = { opacity: 0, transform: `translate(${dx}px,${dy}px) scale(.08,.04)` };
    const expanded = { opacity: 1, transform: "translate(0px,0px) scale(1)" };
    const duration = closing ? CLOSE_DURATION : 220;
    const closeTransform = (progress: number, scale: number) => {
      const start = activeButton ? { x: activeButton.x + activeButton.width / 2, y: activeButton.y + activeButton.height / 2 } : target;
      return `translate(${start.x + (target.x - start.x) * progress - rect.left - element.offsetWidth * scale / 2}px,${start.y + (target.y - start.y) * progress - rect.top - element.offsetHeight * scale / 2}px) scale(${scale})`;
    };
    // Scale the window surface only. Buttons reveal at their natural size and
    // slide into place independently, so circles and icons never get squeezed.
    const animation = element.animate(closing ? closeFrames(initial.transform, closeTransform(1, .035)) : interrupted ? [initial, expanded] : [
      { ...collapsed, offset: 0 },
      { ...collapsed, offset: .12, easing: "cubic-bezier(.2,.75,.25,1)" },
      { opacity: 1, transform: `translate(${dx * .12}px,${dy * .04}px) scale(.76,.96)`, offset: .55, easing: "cubic-bezier(.2,.65,.3,1)" },
      { ...expanded, offset: .84 },
      { ...expanded, offset: 1 },
    ], {
      duration,
      easing: !closing && interrupted ? "cubic-bezier(.16,1,.3,1)" : "linear",
      fill: "both",
    });
    details.current = revealElements.map((item, index) => {
      // Keep the window surface opaque while its contents settle into place.
      const content = index < contentElements.length;
      const visible = { opacity: 1, transform: "translateY(0px)" };
      const hidden = { opacity: 0, transform: content ? "translateY(10px)" : "translateX(-64px)" };
      const buttonReveal = .22 + (index - contentElements.length) * .025;
      if (closing && !content) {
        const toolIndex = index - contentElements.length;
        const position = toolPositions[toolIndex], home = homePositions[toolIndex] ?? position;
        const base = new DOMMatrix(visibleDetails[index].transform === "none" ? undefined : visibleDetails[index].transform);
        const travel = (progress: number) => `translate(${base.m41 + (home.x - position.x) * progress}px,${base.m42 + (home.y - position.y) * progress}px)`;
        const receiving = toolButtons[toolIndex].dataset.readerTrigger === view;
        return [item.animate(closeFrames(travel(0), travel(1)), { duration, fill: "both" }), item.animate(receiving ? [
          { opacity: visibleDetails[index].opacity }, { opacity: 1 },
        ] : [
          { opacity: 0, visibility: "hidden", offset: 0 },
          { opacity: 0, visibility: "hidden", offset: .8 },
          { opacity: 1, visibility: "visible", offset: 1 },
        ], { duration, fill: "both" })];
      }
      return item.animate(closing ? [
        visibleDetails[index],
        visibleDetails[index],
      ] : interrupted ? [visibleDetails[index], visible] : !content ? [
        { ...hidden, offset: 0 },
        { ...hidden, offset: buttonReveal },
        { opacity: 1, transform: hidden.transform, offset: buttonReveal + .06, easing: "cubic-bezier(.25,.1,.35,1)" },
        { ...visible, offset: .95 },
        { ...visible, offset: 1 },
      ] : [
        { ...hidden, offset: 0 },
        { ...hidden, offset: content ? .32 : .48 + (index - contentElements.length) * .045, easing: "cubic-bezier(.2,.65,.3,1)" },
        { ...visible, offset: 1 },
      ], { duration: content || closing ? duration : 160, easing: "linear", fill: "both" });
    }).flat();
    // Keep all content in the shrinking window; fade the complete surface together.
    if (closing) details.current.push(element.animate([
      { opacity: initial.opacity, offset: 0 },
      { opacity: Number(initial.opacity) * .5, offset: 90 / CLOSE_DURATION },
      { opacity: 0, offset: 1 },
    ], { duration, easing: "linear", fill: "both" }));
    motion.current = animation;
    animation.onfinish = () => {
      if (closing) closedCallback.current();
      else { animation.cancel(); motion.current = null; details.current.forEach(detail => detail.cancel()); details.current = []; }
    };
    const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
    const stop = () => {
      if (!reducedMotion.matches) return;
      animation.onfinish = null;
      animation.cancel();
      details.current.forEach(detail => detail.cancel());
      if (closing) closedCallback.current();
    };
    reducedMotion.addEventListener("change", stop);
    return () => reducedMotion.removeEventListener("change", stop);
  }, [view, closing, origin.x, origin.y, c.mode]);
  useEffect(() => { if (c.dragging) { motion.current?.cancel(); details.current.forEach(animation => animation.cancel()); } }, [c.dragging]);
  useEffect(() => () => { if (motion.current) { motion.current.onfinish = null; motion.current.cancel(); } details.current.forEach(animation => animation.cancel()); }, []);
  const docked = c.mode === "left" || c.mode === "right";
  useEffect(() => {
    if (!view) setMenu(false);
  }, [view]);
  useEffect(() => {
    if (!menu) return;
    menuRef.current?.querySelector<HTMLButtonElement>("[aria-checked=true]")?.focus();
    const outside = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node) && !menuButton.current?.contains(event.target as Node)) setMenu(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [menu]);
  const style: CSSProperties = c.mode === "floating" ? { left: compact ? c.viewport.width - c.floating.width - 16 : c.floating.x, top: compact ? c.viewport.height - c.floating.height - 16 : c.floating.y, width: c.floating.width, height: c.floating.height }
    : docked ? { left: c.mode === "left" ? c.viewport.shellLeft : c.viewport.shellLeft + c.viewport.shellWidth - c.dockWidth, top: c.viewport.top, width: c.dockWidth, height: Math.max(0, c.viewport.height - c.viewport.top - 16) } : {};

  function selectMode(mode: PanelMode) { c.changeMode(mode); setMenu(false); menuButton.current?.focus({ preventScroll: true }); }
  return <aside id="reader-panel" ref={ref} className="reader-popup" tabIndex={-1} hidden={!view} data-closing={closing || undefined} data-mode={c.mode} data-dragging={c.dragging || undefined} style={style} aria-label={view ? titles[view] : "阅读辅助窗口"}
    {...c.pointerEvents} onKeyDown={event => {
      if (event.key === "Escape" && !document.querySelector("dialog[open]")) {
        event.stopPropagation();
        if (menu) { setMenu(false); menuButton.current?.focus(); }
        else if (c.mode === "fullscreen") c.exitFullscreen();
        else onClose();
      }
      if (event.key === "Tab" && c.mode === "fullscreen") {
        const controls = [...(ref.current?.querySelectorAll<HTMLElement>("button:not(:disabled),input:not(:disabled),textarea:not(:disabled),select:not(:disabled),a[href],[contenteditable=true],[tabindex='0']") ?? [])].filter(el => el.tabIndex >= 0 && el.getClientRects().length);
        const first = controls[0], last = controls.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    }}>
    <div ref={frame} className="reader-window-frame" inert={closing}>
    <header className="reader-panel-heading" data-movable={!compact} onPointerDown={event => {
      if (!compact && !(event.target as Element).closest("button,[role=menu]")) c.startDrag(event, "move");
    }}>
      <h2 id="reader-panel-title">{view ? titles[view] : ""}</h2>
      <div className="reader-window-actions">
        {c.mode === "fullscreen" && <button type="button" aria-label="退出全屏" title="退出全屏" onClick={c.exitFullscreen}><Minimize size={17}/></button>}
        {compact ? c.mode !== "fullscreen" && <button type="button" aria-label="全屏" title="全屏" onClick={() => c.changeMode("fullscreen")}><Maximize size={19}/></button> : <button type="button" ref={menuButton} aria-label="窗口位置" title="窗口位置" aria-haspopup="menu" aria-expanded={menu} aria-controls="reader-position-menu" onClick={() => setMenu(!menu)}><MoreHorizontal size={19}/></button>}
        <button type="button" onClick={onClose} aria-label="收起窗口" title="收起窗口"><X size={19}/></button>
      </div>
      {menu && !compact && <div id="reader-position-menu" className="reader-position-menu" role="menu" aria-label="窗口位置" ref={menuRef} onKeyDown={event => {
        const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>("button")];
        const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
        if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
          event.preventDefault();
          const next = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : (index + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length;
          buttons[next]?.focus();
        }
      }}>{modes.map(({ key, label, Icon }) => <button key={key} type="button" role="menuitemradio" aria-checked={c.mode === key} onClick={() => selectMode(key)}><Icon size={16}/>{label}</button>)}</div>}
    </header>
    {children}
    </div>
    {tools}
    {docked && !compact && <div className="reader-dock-resize" role="separator" tabIndex={0} aria-label="调整操作区宽度" aria-orientation="vertical" aria-valuemin={360} aria-valuemax={dockLimit(c.viewport)} aria-valuenow={Math.round(c.dockWidth)} onPointerDown={event => c.startDrag(event, "dock")} onKeyDown={event => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      const delta = (event.shiftKey ? 40 : 16) * (event.key === "ArrowRight" ? 1 : -1) * (c.mode === "left" ? 1 : -1);
      c.resizeDock(event.key === "Home" ? 360 : event.key === "End" ? 720 : c.dockWidth + delta);
    }}/>}
    {c.mode === "floating" && !compact && resizeEdges.map(edge => <div key={edge} aria-hidden="true" className={`reader-window-resize reader-window-resize-${edge}`} data-edge={edge} onPointerDown={event => c.startDrag(event, edge)}/>)}
  </aside>;
}
