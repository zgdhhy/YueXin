import Link from "next/link";
import { notFound } from "next/navigation";
import { DigestRow } from "@/components/site/DigestCard";
import { Markdown, extractToc, resolveFigures, withoutLegacySummary } from "@/components/Markdown";
import { ReadingProgress } from "@/components/site/site-client";
import { PaperInformation } from "@/components/reader/paper-information";
import { ReaderWorkspace } from "@/components/reader/reader-workspace";
import { ReaderVideo } from "@/components/reader/reader-video";
import { ReaderTrail } from "@/components/reader/reader-trail";
import { ArrowLeft, ArrowRight, CalendarDays, Clock3 } from "@/components/reading-icons";
import { getWholeNote, getPaperConversation, listPaperConversations } from "@paper/core";
import { fileUrl, getDigestByPaper, listDigests, readMinutes, fmtVideo } from "@/lib/data";

export default async function PaperPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = getDigestByPaper(id);
  if (!data) notFound();
  const { digest, paper, alternates, figures, video, newer, older } = data;
  const body = withoutLegacySummary(digest.contentMd);
  const toc = extractToc(body);
  const conversations = listPaperConversations(digest.paperId);
  const messages = conversations.length ? getPaperConversation(digest.paperId, conversations[0].id).messages.map(({ id, role, content }) => ({ id, role, content })) : [];
  const related = listDigests().filter(d => d.id !== digest.id && d.tags.some(t => digest.tags.includes(t))).slice(0, 2);
  return <>
    <ReadingProgress />
    <ReaderWorkspace key={digest.paperId} subjectId={digest.paperId} toc={toc} conversations={conversations} initialMessages={messages}
      heading={<header className="reader-heading"><div className="reader-topline"><ReaderTrail href="/library" label="论文库" /><p className="reader-meta"><time dateTime={paper.publishedAt} aria-label={`发布日期 ${paper.publishedAt.slice(0, 10)}`}><CalendarDays size={15}/>{paper.publishedAt.slice(0, 10)}</time><span><Clock3 size={15}/>约 {readMinutes(digest.contentMd.length)} 分钟阅读</span></p></div><h1><ReaderTitle text={digest.titleZh}/></h1><p className="reader-lead">{digest.oneLiner}</p></header>}
      resources={<PaperInformation paper={paper} tags={digest.tags} alternates={alternates}/>}
      note={getWholeNote(digest.paperId)}
      overview={(digest.pickReason || video) && <section className="reader-overview">{digest.pickReason && <div className="reader-reason"><h2 className="sr-only">为什么值得读</h2><p>{digest.pickReason}</p></div>}{video && <ReaderVideo src={fileUrl(video.path)} poster={digest.cover ? fileUrl(digest.cover) : undefined} duration={fmtVideo(video.durationSec)}/>}</section>}
    >
        <article className="reading-sheet">
          <Markdown
            reading
            source={resolveFigures(body, figures)}
          />
        </article>
        {related.length > 0 && <section className="reader-related"><h2>沿着这个方向继续读</h2><div className="paper-list">{related.map(d => <DigestRow key={d.id} d={d} />)}</div></section>}
        {(newer || older) && <nav className="reader-next" aria-label="相邻解读"><div>{older && <Link href={`/papers/${older.paperId}`}><span><ArrowLeft size={14}/>上一篇</span>{older.titleZh}</Link>}</div><div>{newer && <Link href={`/papers/${newer.paperId}`}><span>下一篇<ArrowRight size={14}/></span>{newer.titleZh}</Link>}</div></nav>}
    </ReaderWorkspace>
  </>;
}

/** 「主名：副标题」分两行排，避免自动换行把一个词拆到两行。 */
function ReaderTitle({ text }: { text: string }) {
  const at = text.search(/[：:]/);
  if (at <= 0 || at === text.length - 1) return text;
  return <>{text.slice(0, at + 1)}<span className="reader-title-sub">{text.slice(at + 1).trim()}</span></>;
}
