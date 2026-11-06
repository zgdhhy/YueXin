"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import { ResearchFigure, type ResearchFigureItem } from "./research-figure";
import { FileText, Play } from "../reading-icons";

type Mode = "figures" | "video";

export function HomePaperMedia({ figures, video, title }: {
  figures: ResearchFigureItem[];
  video: { src: string; poster?: string; duration: string } | null;
  title: string;
}) {
  const [mode, setMode] = useState<Mode>(figures.length ? "figures" : "video");
  const videoRef = useRef<HTMLVideoElement>(null);
  const figuresTab = useRef<HTMLButtonElement>(null);
  const videoTab = useRef<HTMLButtonElement>(null);
  const [pointerChange, setPointerChange] = useState(false);

  function select(next: Mode, animate: boolean) {
    if (next !== "video") videoRef.current?.pause();
    setPointerChange(animate);
    setMode(next);
  }
  function navigate(event: KeyboardEvent<HTMLDivElement>) {
    if (!video || !figures.length || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === "Home" ? "figures" : event.key === "End" ? "video" : mode === "figures" ? "video" : "figures";
    select(next, false);
    (next === "figures" ? figuresTab : videoTab).current?.focus();
  }

  const tabbed = !!figures.length && !!video;
  return <div className="home-paper-media" data-pointer-change={pointerChange}>
    {tabbed && <div className="home-media-tabs" role="tablist" aria-label="论文预览" onKeyDown={navigate}>
      {!!figures.length && <button ref={figuresTab} id="home-figures-tab" type="button" role="tab" aria-controls="home-figures-panel" aria-selected={mode === "figures"} tabIndex={mode === "figures" ? 0 : -1} onClick={event => select("figures", event.detail > 0)}><FileText size={16} />论文图示</button>}
      {video && <button ref={videoTab} id="home-video-tab" type="button" role="tab" aria-controls="home-video-panel" aria-selected={mode === "video"} tabIndex={mode === "video" ? 0 : -1} onClick={event => select("video", event.detail > 0)}><Play size={15} />视频讲解<small>{video.duration}</small></button>}
    </div>}
    <div className="home-media-panels">
      {!!figures.length && <div id="home-figures-panel" className="home-media-pane" role={tabbed ? "tabpanel" : undefined} aria-labelledby={tabbed ? "home-figures-tab" : undefined} data-active={mode === "figures"}><ResearchFigure figures={figures} /></div>}
      {video && <div id="home-video-panel" className="home-media-pane" role={tabbed ? "tabpanel" : undefined} aria-labelledby={tabbed ? "home-video-tab" : undefined} data-active={mode === "video"}>
        <div className="home-video-frame"><video ref={videoRef} controls preload="none" poster={video.poster} src={video.src} aria-label={`${title}：视频讲解`} /></div>
      </div>}
    </div>
  </div>;
}
