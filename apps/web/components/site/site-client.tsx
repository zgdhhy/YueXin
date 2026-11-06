"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import { readingScroll, readingScroller } from "@/lib/reader/reader-scroll";

export const NAV = [
  { href: "/", label: "首页" },
  { href: "/library", label: "论文库" },
  { href: "/videos", label: "视频" },
  { href: "/tags", label: "研究方向" },
  { href: "/reports", label: "趋势月报" },
];

/** 论文库同时覆盖研究归档与单篇解读 */
export function isNavActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  if (href === "/library") return ["/library", "/timeline", "/papers"].some(p => pathname.startsWith(p));
  return pathname.startsWith(href);
}

export function SiteNav() {
  const pathname = usePathname();
  const active = (href: string) => isNavActive(pathname, href);
  return (
    <nav className="room-nav" aria-label="主导航">
      {NAV.map((n) => (
        <Link
          key={n.href}
          href={n.href}
          aria-current={active(n.href) ? "page" : undefined}
          className={cn(active(n.href) && "is-active")}
        >
          {n.label}
        </Link>
      ))}
    </nav>
  );
}

/** 文章目录：滚动时高亮当前章节 */
export function Toc({ items }: { items: { id: string; text: string }[] }) {
  const [current, setCurrent] = useState(items[0]?.id);
  useEffect(() => {
    const els = items.map((i) => document.getElementById(i.id)).filter((e): e is HTMLElement => !!e);
    const onScroll = () => {
      let cur = els[0]?.id;
      const readerHeader = document.querySelector(".reader-shell") && innerWidth >= 640 ? document.querySelector(".room-header") : null;
      const top = readingScroller()?.getBoundingClientRect().top ?? (readerHeader ? readerHeader.getBoundingClientRect().bottom + 24 : 96);
      for (const el of els) if (el.getBoundingClientRect().top < top + 24) cur = el.id;
      setCurrent(cur);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("reader-scroll", onScroll);
    return () => { window.removeEventListener("scroll", onScroll); window.removeEventListener("reader-scroll", onScroll); };
  }, [items]);
  return (
    <ol className="space-y-0.5 border-l border-stone-200 text-sm">
      {items.map((i) => (
        <li key={i.id}>
          <a
            href={`#${i.id}`}
            aria-current={current === i.id ? "location" : undefined}
            className={cn("-ml-px flex gap-2 border-l-2 py-1.5 pl-4", current === i.id ? "border-indigo-500 font-medium text-indigo-700" : "border-transparent text-stone-500 hover:text-ink")}
          >
            <span className="leading-5">{i.text}</span>
          </a>
        </li>
      ))}
    </ol>
  );
}

/** 顶部阅读进度条 */
export function ReadingProgress() {
  const [p, setP] = useState(0);
  useEffect(() => {
    const onScroll = () => {
      const { height: h, top } = readingScroll();
      setP(h > 0 ? Math.min(1, top / h) : 0);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("reader-scroll", onScroll);
    return () => { window.removeEventListener("scroll", onScroll); window.removeEventListener("reader-scroll", onScroll); };
  }, []);
  return <div className="reading-progress fixed top-0 left-0 z-50 h-0.5 w-full origin-left" style={{ transform: `scaleX(${p})` }} />;
}

