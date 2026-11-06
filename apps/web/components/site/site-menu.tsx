"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRef, useState } from "react";
import { NAV, isNavActive } from "./site-client";
import { SITE_NAME } from "@/lib/brand";

/** 首页的小屏导航：原生模态语义，关闭后焦点自动返回入口。断点见 theme.css。 */
export function SiteMenu() {
  const pathname = usePathname();
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  if (pathname !== "/") return null;
  const close = () => dialog.current?.close();
  return <>
    <button className="site-menu-trigger" type="button" aria-label="打开导航" aria-haspopup="dialog" aria-expanded={open} data-open={open} onClick={() => { dialog.current?.showModal(); setOpen(true); }}><span /><span /></button>
    <dialog className="site-menu-dialog" ref={dialog} aria-label="网站导航" onClose={() => setOpen(false)} onClick={event => { if (event.target === dialog.current) close(); }}>
      <div className="site-menu-top"><span>{SITE_NAME}</span><button className="site-menu-close" type="button" aria-label="关闭导航" onClick={close} autoFocus><span /><span /></button></div>
      <nav aria-label="网站导航">{NAV.map(({ href, label }, index) => <Link key={href} href={href} aria-current={isNavActive(pathname, href) ? "page" : undefined} style={{ animationDelay: `${index * 65}ms` }} onClick={close}>{label}</Link>)}</nav>
    </dialog>
  </>;
}
