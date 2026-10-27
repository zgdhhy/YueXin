import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink, FileText, Code2 } from "lucide-react";
import { Meta, TagChip, DigestRow } from "@/components/DigestCard";
import { Markdown, extractToc, resolveFigures } from "@/components/Markdown";
import { MobileToc, ReadingProgress, Toc } from "@/components/site-client";
import { ReaderVideo } from "@/components/reader-video";
import { fileUrl, getDigestByPaper, listDigests, readMinutes, fmtVideo } from "@/lib/data";

export default async function PaperPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = getDigestByPaper(id);
  if (!data || data.digest.status !== "published") notFound();
  const { digest, paper, alternates, figures, video, newer, older } = data;
  const toc = extractToc(digest.contentMd);
  const card = { ...digest, paperTitle: paper.title, organization: paper.organization, chars: digest.contentMd.length, videoSec: video?.durationSec ?? null };
  const related = listDigests().filter(d => d.id !== digest.id && d.tags.some(t => digest.tags.includes(t))).slice(0, 2);
  return <>
    <ReadingProgress />
    <MobileToc items={toc} />
    <div className="reader-layout">
      <aside className="reader-sidebar"><nav className="reader-toc" aria-label="文章目录"><p>阅读目录 / 约 {readMinutes(digest.contentMd.length)} 分钟</p><Toc items={toc} /></nav></aside>
      <div className="reader-body">
        <Link href="/library" className="reader-back"><ArrowLeft size={15} />返回论文库</Link>
        <header className="reader-heading">
          <Meta d={card} />
          <h1>{digest.titleZh}</h1>
          <p className="paper-original">{paper.title}</p>
          <p className="reader-lead">{digest.oneLiner}</p>
          <div className="reader-tags">{digest.tags.map(t => <TagChip key={t} name={t} />)}</div>
          <div className="reader-sources"><a href={`https://arxiv.org/abs/${paper.id}`} target="_blank" rel="noreferrer"><FileText size={15} />arXiv 原论文<ExternalLink size={12} /></a><a href={`https://arxiv.org/pdf/${paper.id}`} target="_blank" rel="noreferrer">PDF 全文<ExternalLink size={12} /></a>{paper.githubUrl && <a href={paper.githubUrl} target="_blank" rel="noreferrer"><Code2 size={15} />代码仓库<ExternalLink size={12} /></a>}</div>
          <details className="reader-authors"><summary>作者与研究机构</summary><p>{paper.authors.join(", ")}</p>{paper.organization && <p>{paper.organization}</p>}</details>
        </header>
        {digest.pickReason && <aside className="reader-reason"><h2>为什么值得读</h2><p>{digest.pickReason}</p></aside>}
        {video && <ReaderVideo src={fileUrl(video.path)} duration={fmtVideo(video.durationSec)} />}
        <article className="reading-sheet"><Markdown source={resolveFigures(digest.contentMd, figures)} /></article>
        {related.length > 0 && <section className="reader-related"><h2>沿着这个方向继续读</h2><div className="paper-list">{related.map(d => <DigestRow key={d.id} d={d} />)}</div></section>}
        {alternates.length > 0 && <section className="reader-related"><h2>同期值得关注的原论文</h2>{alternates.map(a => <a key={a.paperId} href={`https://arxiv.org/abs/${a.paperId}`} target="_blank" rel="noreferrer"><span>{a.title} <ExternalLink size={13} className="inline" /></span><p>{a.reason}</p></a>)}</section>}
        {(newer || older) && <nav className="reader-next" aria-label="相邻解读"><div>{older && <Link href={`/papers/${older.paperId}`}><span>上一篇</span>{older.titleZh}</Link>}</div><div>{newer && <Link href={`/papers/${newer.paperId}`}><span>下一篇</span>{newer.titleZh}</Link>}</div></nav>}
      </div>
    </div>
  </>;
}
