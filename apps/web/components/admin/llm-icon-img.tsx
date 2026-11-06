"use client";

import { useState } from "react";
import { iconAsset, type LlmIcon } from "@paper/core/icons";

/** Brand assets are local and checked at build time; failed images retain a stable monogram. */
export function LlmIconImg({ icon, name, size = 20 }: { icon: LlmIcon | null; name: string; size?: number }) {
  const src = icon ? iconAsset(icon) : null;
  const [failed, setFailed] = useState<string | null>(null);
  if (src && failed !== src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt="" width={size} height={size} className="shrink-0 object-contain" style={{width:size,height:size}} onError={()=>setFailed(src)} />;
  }
  const initials=name.split(/[\s\-_/（(]+/).filter(Boolean).slice(0,2).map(w=>w[0]!.toUpperCase()).join("");
  return <span aria-hidden="true" className="inline-flex shrink-0 items-center justify-center rounded-md bg-slate-100 font-semibold text-slate-500" style={{width:size,height:size,fontSize:size*.4}}>{initials || "?"}</span>;
}
