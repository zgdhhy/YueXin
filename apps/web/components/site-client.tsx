"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, useRef } from "react";
import { cn } from "@/lib/cn";

const NAV = [
  { href: "/", label: "精选" },
  { href: "/library", label: "论文库" },
  { href: "/tags", label: "研究方向" },
  { href: "/reports", label: "趋势月报" },
];

export function SiteNav() {
  const pathname = usePathname();
  const active = (href: string) => (href === "/" ? pathname === "/" : href === "/library" ? ["/library", "/timeline", "/papers"].some(p => pathname.startsWith(p)) : pathname.startsWith(href));
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
      for (const el of els) if (el.getBoundingClientRect().top < 120) cur = el.id;
      setCurrent(cur);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [items]);
  return (
    <ol className="space-y-0.5 border-l border-stone-200 text-sm">
      {items.map((i, idx) => (
        <li key={i.id}>
          <a
            href={`#${i.id}`}
            aria-current={current === i.id ? "location" : undefined}
            className={cn("-ml-px flex gap-2 border-l-2 py-1.5 pl-4", current === i.id ? "border-indigo-500 font-medium text-indigo-700" : "border-transparent text-stone-500 hover:text-ink")}
          >
            <span className="w-4 shrink-0 text-xs leading-5 text-stone-400 tabular-nums">{idx + 1}</span>
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
      const h = document.documentElement.scrollHeight - window.innerHeight;
      setP(h > 0 ? Math.min(1, window.scrollY / h) : 0);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return <div className="fixed top-0 left-0 z-50 h-0.5 w-full origin-left bg-indigo-500" style={{ transform: `scaleX(${p})` }} />;
}

/** 手机端目录：右下角悬浮按钮，点开底部抽屉 */
export function MobileToc({ items }: { items: { id: string; text: string }[] }) {
  const dialog = useRef<HTMLDialogElement>(null);
  if (!items.length) return null;
  return <div className="lg:hidden">
    <button type="button" aria-haspopup="dialog" onClick={() => dialog.current?.showModal()} className="mobile-toc-button fixed right-4 bottom-5 z-40 flex items-center gap-2 rounded-full bg-ink px-4 py-3 text-sm font-medium text-white shadow-md"><ListIcon />文章目录</button>
    <dialog ref={dialog} className="mobile-toc-dialog" aria-labelledby="mobile-toc-title" onClick={e => { if (e.target === dialog.current) dialog.current.close(); }}>
      <div className="flex items-center justify-between border-b border-stone-200 pb-3"><h2 id="mobile-toc-title" className="text-base font-semibold">文章目录</h2><button type="button" className="min-h-11 px-3" onClick={() => dialog.current?.close()}>关闭</button></div>
      <div className="pt-4" onClick={e => { if ((e.target as HTMLElement).closest("a")) dialog.current?.close(); }}><Toc items={items} /></div>
    </dialog>
  </div>;
}

function ListIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
    </svg>
  );
}
