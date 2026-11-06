"use client";

import { useState } from "react";
import { ArrowUpRight } from "../reading-icons";

export type ResearchFigureItem = { src: string; label: string; caption: string };

export function ResearchFigure({ figures }: { figures: ResearchFigureItem[] }) {
  const [selected, setSelected] = useState(0);
  const [pointerSelection, setPointerSelection] = useState(false);
  if (!figures.length) return null;
  const current = figures[selected];

  return <div className="research-figure-viewer" data-pointer-selection={pointerSelection}>
    <div className="research-figure-stage">
      <a href={current.src} target="_blank" rel="noreferrer" data-lightbox aria-label={`放大原图：${current.caption}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img key={current.src} src={current.src} alt={current.caption} className="research-figure-image" />
        <ArrowUpRight size={18} aria-hidden="true" />
      </a>
    </div>
    <div className="research-figure-caption">
      <div className="research-figure-options" role="group" aria-label="选择论文原图">
        {figures.map((figure, index) => <button key={figure.src} type="button" aria-pressed={index === selected} onClick={event => { setPointerSelection(event.detail > 0); setSelected(index); }}>{figure.label}</button>)}
      </div>
      <div className="research-figure-notes">
        <p aria-live="polite">{current.caption}</p>
        {figures.map(figure => <p key={figure.src} aria-hidden="true">{figure.caption}</p>)}
      </div>
    </div>
  </div>;
}
