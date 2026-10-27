import Link from "next/link";
import { ArrowUpRight, BookOpen, PlayCircle } from "lucide-react";
import { DigestRow, Meta, TagChip } from "@/components/DigestCard";
import { latestReport, listDigests, reportLead, tagCounts, fileUrl } from "@/lib/data";
import { PaperImage } from "@/components/paper-image";

export default function HomePage() {
  const all = listDigests();
  const [latest, ...rest] = all;
  const tags = tagCounts().slice(0, 8);
  const report = latestReport();
  if (!latest) return <section className="room-empty"><BookOpen size={32} /><h1>从一篇论文，开始理解前沿</h1><p>这里将呈现精选论文的中文解读、关键图表与讲解视频。</p><Link className="room-button" href="/admin">配置并生成第一篇解读</Link></section>;
  return (
    <div className="reading-home">
      <section className="home-selection" aria-labelledby="featured-title">
        <div className="selection-heading"><span>本期精选</span><Link href="/library">浏览论文库 <ArrowUpRight size={15} /></Link></div>
        <div className="selection-copy">
          <Meta d={latest} />
          <h1 id="featured-title"><Link href={`/papers/${latest.paperId}`}>{latest.titleZh}</Link></h1>
          <p className="paper-original">{latest.paperTitle}{latest.organization && <span>{latest.organization}</span>}</p>
          <p className="selection-summary">{latest.oneLiner}</p>
          {latest.pickReason && <div className="selection-reason"><span>为什么值得读</span><p>{latest.pickReason}</p></div>}
          <div className="selection-actions"><Link href={`/papers/${latest.paperId}`} className="room-button">阅读解读</Link>{latest.videoSec != null && latest.videoSec > 0 && <Link href={`/papers/${latest.paperId}#video`} className="room-text-button"><PlayCircle size={18} />观看讲解</Link>}</div>
          <div className="selection-tags">{latest.tags.slice(0, 4).map(t => <TagChip key={t} name={t} />)}</div>
        </div>
        {latest.cover && <Link className="selection-figure" href={`/papers/${latest.paperId}`} aria-label={`阅读：${latest.titleZh}`}><PaperImage src={fileUrl(latest.cover)} title={latest.paperTitle} /><span>论文原图 · 在解读中查看方法与实验</span></Link>}
      </section>
      {rest.length > 0 && <section className="home-past"><div className="section-heading"><div><h2>接着读</h2><p>沿着一篇篇论文，理解研究如何演进。</p></div><Link href="/library">全部解读 <ArrowUpRight size={15} /></Link></div><div className="paper-list">{rest.slice(0, 5).map(d => <DigestRow key={d.id} d={d} />)}</div></section>}
      <div className="home-discovery">
        <section><div className="section-heading"><h2>探索研究方向</h2><Link href="/tags">全部方向</Link></div>{tags.length ? <div className="home-topics">{tags.map(t => <Link href={`/library?tag=${encodeURIComponent(t.name)}`} key={t.name}><span>{t.name}</span><span>{t.count} 篇</span></Link>)}</div> : <p className="room-muted">解读发布后，会在这里汇集研究方向。</p>}</section>
        <section className="home-report"><div className="section-heading"><h2>放到趋势中看</h2><Link href="/reports">趋势月报</Link></div>{report ? <><time>{report.month.replace("-", " 年 ")} 月</time><h3><Link href={`/reports/${report.month}`}>{report.title}</Link></h3><p>{reportLead(report.contentMd) || "汇集本月解读，回看研究主线与值得关注的变化。"}</p><Link href={`/reports/${report.month}`} className="room-text-button">阅读本期月报 <ArrowUpRight size={15} /></Link></> : <p className="room-muted">月报会将一个月的解读串成研究脉络。发布后可在这里阅读。</p>}</section>
      </div>
      <p className="home-note">从 HF Daily Papers、arXiv 与高引论文中选题，提供中文精读与讲解视频。已收录 {all.length} 篇解读。</p>
    </div>
  );
}
