import Link from "next/link";
import { Search } from "lucide-react";
import { DigestRow } from "@/components/DigestCard";
import { listDigests, tagCounts } from "@/lib/data";

export default async function LibraryPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q.trim() : "";
  const tag = typeof params.tag === "string" ? params.tag : "";
  const video = params.video === "1";
  const sort = params.sort === "oldest" ? "oldest" : "newest";
  const all = listDigests();
  const items = all.filter(d => (!tag || d.tags.includes(tag)) && (!video || (d.videoSec ?? 0) > 0) && (!q || [d.titleZh, d.paperTitle, d.oneLiner, d.organization ?? "", ...d.tags].join(" ").toLocaleLowerCase().includes(q.toLocaleLowerCase())));
  if (sort === "oldest") items.reverse();
  return <div className="collection-page">
    <header className="collection-heading"><h1>论文库</h1><p>找到一个问题，沿着论文读下去。</p></header>
    <form action="/library" className="library-filter">
      <div className="library-search"><Search size={18} aria-hidden="true" /><input type="search" name="q" defaultValue={q} placeholder="搜索中英文标题、摘要或研究方向" aria-label="搜索论文" /><button type="submit" className="room-button">搜索</button></div>
      <div className="library-options"><label>研究方向<select name="tag" defaultValue={tag}><option value="">全部方向</option>{tagCounts().map(t => <option key={t.name} value={t.name}>{t.name}（{t.count}）</option>)}</select></label><label>排列顺序<select name="sort" defaultValue={sort}><option value="newest">最新发布</option><option value="oldest">最早发布</option></select></label><label className="library-check"><input type="checkbox" name="video" value="1" defaultChecked={video} />包含讲解视频</label><button type="submit" className="room-text-button">应用筛选</button></div>
    </form>
    <div className="library-result"><span>{items.length} 篇解读{tag && ` / ${tag}`}</span><div>{(q || tag || video || sort === "oldest") && <Link href="/library">清除筛选</Link>}<Link href="/timeline">按月回顾</Link></div></div>
    {items.length ? <div className="paper-list">{items.map(d => <DigestRow key={d.id} d={d} />)}</div> : <div className="room-empty"><Search size={28} /><h2>{all.length ? "没有找到匹配的论文" : "第一篇精读即将从这里开始"}</h2><p>{all.length ? "试试更短的关键词，或清除筛选查看全部解读。" : "前往后台配置模型并运行后，已发布的解读会汇集在这里。"}</p><Link href={all.length ? "/library" : "/admin"} className="room-text-button">{all.length ? "查看全部解读" : "前往后台"}</Link></div>}
  </div>;
}
