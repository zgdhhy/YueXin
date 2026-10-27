"use client";

import { useEffect, useRef } from "react";
import { PlayCircle } from "lucide-react";

export function ReaderVideo({ src, duration }: { src: string; duration: string }) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const openFromLink = () => { if (window.location.hash === "#video" && ref.current) ref.current.open = true; };
    openFromLink();
    window.addEventListener("hashchange", openFromLink);
    return () => window.removeEventListener("hashchange", openFromLink);
  }, []);
  return <details className="reader-video" id="video" ref={ref}><summary><PlayCircle size={18} /><span>用视频理解这篇论文</span><small>{duration} · 点击展开讲解</small></summary><video controls preload="none" src={src} aria-label="论文讲解视频" /></details>;
}
