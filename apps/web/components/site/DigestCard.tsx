import Link from "next/link";
import { ArrowUpRight, Clock3, Play } from "@/components/reading-icons";
import { fileUrl, fmtVideo, readMinutes, type DigestCard as Card } from "@/lib/data";
import { PaperImage } from "./paper-image";

export function TagChip({ name, count }: { name: string; count?: number }) {
  return <Link href={`/tags/${encodeURIComponent(name)}`} className="tag-chip">{name}{count != null && <span>{count}</span>}</Link>;
}

function Meta({ d }: { d: Card }) {
  return <div className="paper-meta"><time dateTime={d.createdAt}>{d.createdAt.slice(0, 10)}</time><span><Clock3 size={13} />约 {readMinutes(d.chars)} 分钟</span>{d.videoSec != null && d.videoSec > 0 && <span><Play size={12} />{fmtVideo(d.videoSec)}</span>}</div>;
}

function Cover({ d, className = "" }: { d: Card; className?: string }) {
  return <div className={`paper-cover ${className}`}>{d.cover ? <PaperImage src={fileUrl(d.cover)} title={d.paperTitle} /> : <div className="paper-cover-type"><span>研究解读</span><p>{d.paperTitle}</p></div>}</div>;
}

function PaperCard({ d }: { d: Card }) {
  return <article className="paper-card"><Link className="paper-card-visual" href={`/papers/${d.paperId}`} aria-label={`阅读：${d.titleZh}`}><Cover d={d} /><ArrowUpRight className="paper-card-open" size={18} /></Link><div className="paper-card-copy"><Meta d={d} /><h2><Link href={`/papers/${d.paperId}`}>{d.titleZh}</Link></h2><p>{d.oneLiner}</p><div className="paper-card-topics">{d.tags.slice(0, 2).map(name => <TagChip key={name} name={name} />)}</div></div></article>;
}

export function PaperGrid({ items }: { items: Card[] }) {
  return <div className="paper-grid">{items.map(d => <PaperCard key={d.id} d={d} />)}</div>;
}

export function DigestRow({ d }: { d: Card }) {
  return <article className="digest-row"><div className="digest-row-copy"><Meta d={d} /><h3><Link href={`/papers/${d.paperId}`}>{d.titleZh}</Link></h3><p>{d.oneLiner}</p><div className="digest-row-tags">{d.tags.slice(0, 2).map(name => <TagChip key={name} name={name} />)}</div></div>{d.cover && <Link className="digest-row-cover" href={`/papers/${d.paperId}`} aria-label={`阅读：${d.titleZh}`}><Cover d={d} /></Link>}</article>;
}
