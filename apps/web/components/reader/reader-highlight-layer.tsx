"use client";

import { useLayoutEffect, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import type { ReadingHighlight } from "@paper/core";
import { highlightRange, selectedText } from "@/lib/reader/highlight-anchor";

type Mark = { left: number; top: number; width: number; height: number; color: string; id: number };

/** Paint one marker band per text line, independent of KaTeX's font metrics. */
export function ReaderHighlightLayer({ body, items, pendingRange, pendingColor }: { body: RefObject<HTMLDivElement | null>; items: ReadingHighlight[]; pendingRange: Range | null; pendingColor: string }) {
  const [marks, setMarks] = useState<Mark[]>([]);
  useLayoutEffect(() => {
    const root = body.current;
    if (!root) return;
    let frame = 0, alive = true;
    function measure() {
      if (!alive || !root) return;
      const origin = root.getBoundingClientRect(), next: Mark[] = [];
      const sources = items.flatMap(item => {
        const range = highlightRange(root, item);
        if (!range || pendingRange && range.compareBoundaryPoints(Range.START_TO_START, pendingRange) === 0 && range.compareBoundaryPoints(Range.END_TO_END, pendingRange) === 0) return [];
        return [{ id: item.id, color: `${item.color}66`, range }];
      });
      if (pendingRange) sources.push({ id: -1, color: pendingColor, range: pendingRange });
      for (const { id, color, range } of sources) {
        const seen = new Set<Element>();
        const lines: { center: number; height: number; rects: DOMRect[]; plain: boolean }[] = [];
        for (const piece of selectedText(root, range)) {
          const math = piece.node.parentElement?.closest<HTMLElement>(".katex");
          if (math && seen.has(math)) continue;
          if (math) seen.add(math);
          const parent = (math ?? piece.node.parentElement)?.closest("p,li,h1,h2,h3,h4,td,th,blockquote,pre") ?? root;
          const font = parseFloat(getComputedStyle(parent).fontSize), height = font * 1.4;
          const rects = math ? math.getClientRects() : piece.range.getClientRects();
          for (const rect of rects) {
            if (!rect.width || !rect.height) continue;
            const center = rect.top + rect.height / 2;
            const line = lines.find(line => Math.abs(line.center - center) < height * .55);
            if (line) {
              line.rects.push(rect);
              if (!math && !line.plain) { line.center = center; line.plain = true; }
              line.height = Math.max(line.height, height);
            } else lines.push({ center, height, rects: [rect], plain: !math });
          }
        }
        for (const line of lines) {
          const runs: { left: number; right: number }[] = [];
          for (const rect of line.rects.sort((a, b) => a.left - b.left)) {
            const last = runs[runs.length - 1];
            if (last && rect.left <= last.right + 2) last.right = Math.max(last.right, rect.right);
            else runs.push({ left: rect.left, right: rect.right });
          }
          for (const run of runs) next.push({ id, color, left: run.left - origin.left, top: line.center - origin.top - line.height / 2, width: run.right - run.left, height: line.height });
        }
      }
      setMarks(next);
    }
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(measure); };
    measure();
    const observer = new ResizeObserver(schedule); observer.observe(root);
    root.addEventListener("load", schedule, true);
    window.addEventListener("resize", schedule);
    void document.fonts.ready.then(schedule);
    return () => { alive = false; cancelAnimationFrame(frame); observer.disconnect(); root.removeEventListener("load", schedule, true); window.removeEventListener("resize", schedule); };
  }, [body, items, pendingRange, pendingColor]);
  return body.current && createPortal(<div className="reader-highlight-layer" aria-hidden="true">{marks.map((mark, index) => <span key={index} data-highlight-id={mark.id} style={{ left: mark.left, top: mark.top, width: mark.width, height: mark.height, backgroundColor: mark.color }}/>)}</div>, body.current);
}
