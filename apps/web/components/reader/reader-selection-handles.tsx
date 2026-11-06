"use client";
import { useEffect, useRef, useState, type PointerEvent } from "react";

export function ReaderSelectionHandles({ range, onChange, onStart, onEnd }: { range: Range; onChange: (range: Range) => void; onStart: () => void; onEnd: () => void }) {
  const cleanup = useRef<(() => void) | null>(null);
  const [reversed, setReversed] = useState(false);
  useEffect(() => () => cleanup.current?.(), []);
  const start = range.cloneRange(), end = range.cloneRange();
  start.collapse(true); end.collapse(false);
  const points = [start.getBoundingClientRect(), end.getBoundingClientRect()];
  function drag(event: PointerEvent<HTMLButtonElement>, side: number) {
    event.preventDefault(); event.stopPropagation();
    cleanup.current?.();
    // Short selections have overlapping hit areas: grab the nearest visible dot.
    const distance = (rect: DOMRect, index: number) => (rect.left - event.clientX) ** 2 + ((index ? rect.bottom : rect.top) - event.clientY) ** 2;
    side = distance(points[0], 0) <= distance(points[1], 1) ? 0 : 1;
    const button = event.currentTarget, original = range.cloneRange();
    const fixed = original.cloneRange();
    fixed.collapse(side === 1);
    let previous = original;
    const endpoint = points[side];
    // Preserve the grab offset throughout the larger hit area.
    const offsetX = endpoint.left - event.clientX;
    const offsetY = endpoint.top + endpoint.height / 2 - event.clientY;
    button.setPointerCapture(event.pointerId);
    onStart();
    const move = (event: globalThis.PointerEvent) => {
      const doc = document as Document & { caretRangeFromPoint?: (x: number, y: number) => Range | null };
      // Hit-test the text beneath the handles/popover, including when they overlap.
      const overlays = [...document.querySelectorAll<HTMLElement>(".reader-selection-handle,.reader-selection-popover")];
      const pointerEvents = overlays.map(element => element.style.pointerEvents);
      let caret: Range | null | undefined;
      try {
        overlays.forEach(element => { element.style.pointerEvents = "none"; });
        caret = doc.caretRangeFromPoint?.(event.clientX + offsetX, event.clientY + offsetY);
      } finally {
        overlays.forEach((element, index) => { element.style.pointerEvents = pointerEvents[index]; });
      }
      if (!caret || !document.querySelector(".reader-body")?.contains(caret.startContainer)) return;
      const beforeFixed = caret.compareBoundaryPoints(Range.START_TO_START, fixed) < 0;
      const next = fixed.cloneRange();
      if (beforeFixed) next.setStart(caret.startContainer, caret.startOffset);
      else next.setEnd(caret.startContainer, caret.startOffset);
      if (next.compareBoundaryPoints(Range.START_TO_START, previous) === 0 && next.compareBoundaryPoints(Range.END_TO_END, previous) === 0) return;
      const quote = next.toString().trim();
      if (!next.collapsed && quote && quote.length <= 5000) {
        previous = next;
        // Keep the captured button under the pointer when the endpoints cross.
        setReversed(side === 0 ? !beforeFixed : beforeFixed);
        onChange(next);
      }
    };
    const stop = () => {
      cleanup.current = null;
      button.removeEventListener("pointermove", move);
      button.removeEventListener("pointerup", stop);
      button.removeEventListener("pointercancel", stop);
      button.removeEventListener("lostpointercapture", stop);
      window.removeEventListener("blur", stop);
      if (button.hasPointerCapture(event.pointerId)) button.releasePointerCapture(event.pointerId);
      setReversed(false);
      onEnd();
    };
    cleanup.current = stop;
    button.addEventListener("pointermove", move); button.addEventListener("pointerup", stop); button.addEventListener("pointercancel", stop);
    button.addEventListener("lostpointercapture", stop); window.addEventListener("blur", stop);
  }
  return <>{[0, 1].map(key => {
    const side = reversed ? 1 - key : key, rect = points[side];
    return <button key={key} type="button" className="reader-selection-handle" aria-label={side ? "拖动调整选区终点" : "拖动调整选区起点"} style={{ left: rect.left, top: side ? rect.bottom : rect.top }} onPointerDown={event => drag(event, side)}><span/></button>;
  })}</>;
}
