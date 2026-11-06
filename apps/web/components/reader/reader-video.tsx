"use client";

import { useEffect, useRef } from "react";
import { PlayCircle } from "../reading-icons";

/** 默认收起成一行，展开即播放；带 #video 的链接会直接展开。 */
export function ReaderVideo({ src, poster, duration }: { src: string; poster?: string; duration: string }) {
  const ref = useRef<HTMLDetailsElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const openFromLink = () => { if (window.location.hash === "#video" && ref.current) ref.current.open = true; };
    openFromLink();
    window.addEventListener("hashchange", openFromLink);
    return () => window.removeEventListener("hashchange", openFromLink);
  }, []);
  return <details className="reader-video" id="video" ref={ref} onToggle={event => {
    if (event.currentTarget.open) void video.current?.play().catch(() => {});
    else video.current?.pause();
  }}><summary><PlayCircle size={20} /><span>视频讲解</span><time>{duration}</time></summary><video ref={video} controls preload="none" src={src} poster={poster} aria-label="论文讲解视频" /></details>;
}
