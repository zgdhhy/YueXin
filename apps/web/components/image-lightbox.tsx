"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "./reading-icons";

/** 全站图片放大：带 data-lightbox 的链接普通点击时在页面中央放大，Ctrl/中键等仍按链接打开原图。 */
export function ImageLightbox() {
  const dialog = useRef<HTMLDialogElement>(null);
  const [image, setImage] = useState<{ src: string; alt: string } | null>(null);
  useEffect(() => {
    const click = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = (event.target as Element | null)?.closest?.("a[data-lightbox]");
      if (!(link instanceof HTMLAnchorElement)) return;
      event.preventDefault();
      setImage({ src: link.href, alt: link.querySelector("img")?.alt ?? "" });
    };
    document.addEventListener("click", click);
    return () => document.removeEventListener("click", click);
  }, []);
  useEffect(() => { if (image && !dialog.current?.open) dialog.current?.showModal(); }, [image]);
  return <dialog ref={dialog} className="image-lightbox" aria-label={image?.alt || "图片"} onClose={() => setImage(null)} onClick={event => { if (event.target === event.currentTarget || (event.target as Element).tagName === "IMG") dialog.current?.close(); }}>
    {image && <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={image.src} alt={image.alt} />
      {image.alt && <p>{image.alt}</p>}
      <button type="button" aria-label="关闭" onClick={() => dialog.current?.close()} autoFocus><X size={20} /></button>
    </>}
  </dialog>;
}
