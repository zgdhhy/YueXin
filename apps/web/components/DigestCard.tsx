import Link from "next/link";
import { Clock, PlayCircle, Sparkles } from "lucide-react";
import { fileUrl, fmtVideo, readMinutes, type DigestCard as Card } from "@/lib/data";
import { PaperImage } from "./paper-image";
import { cn } from "@/lib/cn";

export function TagChip({ name, count }: { name: string; count?: number }) {
  return (
    <Link
      href={`/library?tag=${encodeURIComponent(name)}`}
      className="tag-chip relative z-10"
    >
      # {name}
      {count != null && <span className="text-stone-400">{count}</span>}
    </Link>
  );
}

export function Meta({ d }: { d: Card }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-stone-500">
      <time>{d.createdAt.slice(0, 10)}</time>
      <span className="inline-flex items-center gap-1">
        <Clock className="h-3.5 w-3.5" />
        {readMinutes(d.chars)} 分钟阅读
      </span>
      {d.videoSec != null && d.videoSec > 0 && (
        <span className="inline-flex items-center gap-1 text-indigo-600">
          <PlayCircle className="h-3.5 w-3.5" />
          视频 {fmtVideo(d.videoSec)}
        </span>
      )}
      {d.notable && (
        <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-amber-700">
          <Sparkles className="h-3 w-3" />
          近期重要
        </span>
      )}
    </div>
  );
}

export function Cover({ d, className = "" }: { d: Card; className?: string }) {
  return (
    <div className={cn("paper-cover relative overflow-hidden", className)}>
      {d.cover ? (
        <PaperImage src={fileUrl(d.cover)} title={d.paperTitle} />
      ) : (
        <div className="flex h-full items-center justify-center p-6 text-center text-sm text-stone-400">{d.paperTitle}</div>
      )}
      {d.videoSec != null && d.videoSec > 0 && (
        <span className="absolute right-3 bottom-3 inline-flex items-center gap-1 rounded-full bg-ink/80 px-2.5 py-1 text-xs text-white backdrop-blur">
          <PlayCircle className="h-3.5 w-3.5" />
          {fmtVideo(d.videoSec)}
        </span>
      )}
    </div>
  );
}

/** 紧凑的列表项 */
export function DigestRow({ d }: { d: Card }) {
  return (
    <article className="digest-row">
      <div className="digest-row-copy">
        <Meta d={d} />
        <h3><Link href={`/papers/${d.paperId}`}>{d.titleZh}</Link></h3>
        <p>{d.oneLiner}</p>
        <div className="digest-row-tags">{d.tags.slice(0, 4).map(t => <TagChip key={t} name={t} />)}</div>
      </div>
      {d.cover && <Cover d={d} />}
    </article>
  );
}
