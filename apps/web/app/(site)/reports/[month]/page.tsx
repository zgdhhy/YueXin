import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { ReaderTrail } from "@/components/reader/reader-trail";
import { db, schema, reportSubject, getWholeNote, listReadingConversations, getReadingConversation } from "@paper/core";
import { Markdown, extractToc } from "@/components/Markdown";
import { ReadingProgress } from "@/components/site/site-client";
import { ReaderWorkspace } from "@/components/reader/reader-workspace";

export default async function ReportPage({ params }: { params: Promise<{ month: string }> }) {
  const { month } = await params;
  const report = db.select().from(schema.trendReports).where(eq(schema.trendReports.month, month)).get();
  if (!report) notFound();
  const toc = extractToc(report.contentMd);
  const [y, m] = report.month.split("-");
  const subjectId = reportSubject(report.month);
  const note = getWholeNote(subjectId);
  const conversations = listReadingConversations(subjectId);
  const initialMessages = conversations.length ? getReadingConversation(subjectId, conversations[0].id).messages.map(({ id, role, content }) => ({ id, role, content })) : [];
  return <><ReadingProgress/><ReaderWorkspace key={subjectId} subjectId={subjectId} kind="report" toc={toc} note={note} conversations={conversations} initialMessages={initialMessages} overview={null}
    heading={<header className="reader-heading"><div className="reader-topline"><ReaderTrail href="/reports" label="趋势月报" /><p className="reader-meta">{y} 年 {Number(m)} 月</p></div><h1>{report.title}</h1></header>}
    resources={<div className="reader-resources"><p className="paper-original">{report.title}</p><p>{y} 年 {Number(m)} 月趋势月报</p></div>}>
    <article className="reading-sheet"><Markdown reading source={report.contentMd}/></article>
  </ReaderWorkspace></>;
}
