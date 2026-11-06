import Link from "next/link";
import { ArrowRight, ArrowUpRight } from "@/components/reading-icons";
import { fileUrl, latestReport, listDigests, tagCounts, getDigestByPaper, readMinutes, fmtVideo } from "@/lib/data";
import type { ResearchFigureItem } from "@/components/site/research-figure";
import { HomePaperMedia } from "@/components/site/home-paper-media";
import { SiteMotion } from "@/components/site/site-motion";
import { DigestRow, TagChip } from "@/components/site/DigestCard";
import { SITE_NAME } from "@/lib/brand";
import "./home.css";

export default function HomePage() {
  const papers = listDigests();
  const featured = papers[0];
  const detail = featured ? getDigestByPaper(featured.paperId) : null;
  const report = latestReport();
  const topics = tagCounts();
  const figures: ResearchFigureItem[] = [];
  if (detail) {
    for (const match of detail.digest.contentMd.matchAll(/!\[([^\]]*)\]\(figure:\/\/([^)]+)\)/g)) {
      const figure = detail.figures.find(item => item.label.toLowerCase() === match[2].toLowerCase());
      if (!figure || figures.some(item => item.src === fileUrl(figure.path))) continue;
      figures.push({src:fileUrl(figure.path), label:figure.label.replace(/^(?:figure|fig)\s*/i,"图 "), caption:match[1]});
      if (figures.length === 3) break;
    }
    if (!figures.length && featured?.cover) figures.push({src:fileUrl(featured.cover),label:"论文原图",caption:featured.paperTitle});
  }

  // 最新一篇摊开成一张展页：左页是解读，右页是论文原图或视频，翻开动作只在首次进入时出现一次。
  return <SiteMotion><div className="research-home">
    <h1 className="sr-only">{SITE_NAME}</h1>
    {featured ? <article className="home-spread" aria-labelledby="home-feature-title">
      <div className="home-spread-page">
        <p className="home-spread-meta"><time dateTime={featured.createdAt}>{featured.createdAt.slice(0, 10)}</time><span>约 {readMinutes(featured.chars)} 分钟</span><a href={`https://arxiv.org/abs/${featured.paperId}`} target="_blank" rel="noreferrer">arXiv {featured.paperId}<ArrowUpRight size={14} /></a></p>
        <h2 id="home-feature-title"><Link href={`/papers/${featured.paperId}`}>{featured.titleZh}</Link></h2>
        <p className="home-spread-lead">{featured.oneLiner}</p>
        <div className="home-spread-tags">{featured.tags.slice(0, 3).map(name => <TagChip key={name} name={name} />)}</div>
        <Link className="home-primary" href={`/papers/${featured.paperId}`}>阅读解读<span><ArrowRight size={18} /></span></Link>
      </div>
      {(figures.length > 0 || detail?.video) && <div className="home-spread-page home-spread-figure"><HomePaperMedia figures={figures} title={featured.titleZh} video={detail?.video ? {src:fileUrl(detail.video.path), poster:featured.cover ? fileUrl(featured.cover) : undefined, duration:fmtVideo(detail.video.durationSec)} : null} /></div>}
    </article> : <section className="home-spread home-empty"><div className="home-spread-page"><h2>还没有解读</h2><Link className="home-primary" href="/admin">前往后台<span><ArrowRight size={18} /></span></Link></div></section>}

    {papers.length > 1 && <section className="home-section" data-reveal aria-labelledby="home-more-title"><div className="home-section-heading"><h2 id="home-more-title">继续阅读</h2><Link href="/library">全部论文<ArrowRight size={16} /></Link></div>{papers.slice(1,4).map(paper => <DigestRow key={paper.id} d={paper} />)}</section>}

    <div className="home-index" data-reveal>
      <section className="home-section" aria-labelledby="home-report-title">
        <div className="home-section-heading"><h2 id="home-report-title">趋势月报</h2><Link href="/reports">往期<ArrowRight size={16} /></Link></div>
        {report ? <Link className="home-report" href={`/reports/${report.month}`}><strong>{Number(report.month.slice(5))}<small>月</small></strong><span><small>{report.month.slice(0, 4)}</small>{report.title}</span><ArrowUpRight size={20} /></Link> : <p className="home-none">还没有月报</p>}
      </section>
      <section className="home-section" aria-labelledby="home-topics-title">
        <div className="home-section-heading"><h2 id="home-topics-title">研究方向</h2><Link href="/tags">全部<ArrowRight size={16} /></Link></div>
        <ol className="home-topic-list">{topics.slice(0,6).map(topic => <li key={topic.name}><Link href={`/tags/${encodeURIComponent(topic.name)}`}><span>{topic.name}</span><small>{topic.count}</small></Link></li>)}</ol>
      </section>
    </div>
  </div></SiteMotion>;
}
