"use client";

import { useState } from "react";

export function PaperImage({ src, title }: { src: string; title: string }) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  if (failedSrc === src) {
    return <div className="paper-image-fallback flex h-full items-center justify-center p-6 text-center">{title}</div>;
  }
  // Paper figures are served from the local file endpoint.
  // eslint-disable-next-line @next/next/no-img-element
  return <img ref={(image) => { if (image?.complete && image.naturalWidth === 0) setFailedSrc(src); }} src={src} alt="" onError={() => setFailedSrc(src)} className="h-full w-full object-contain p-4" />;
}
