import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { ArrowLeft } from "lucide-react";
import { db, schema } from "@paper/core";
import { Markdown, extractToc } from "@/components/Markdown";
import { MobileToc, ReadingProgress, Toc } from "@/components/site-client";

export default async function ReportPage({ params }: { params: Promise<{ month: string }> }) {
  const { month } = await params;
  const report = db.select().from(schema.trendReports).where(eq(schema.trendReports.month, month)).get();
  if (!report) notFound();
  const toc = extractToc(report.contentMd);
  const [y, m] = report.month.split("-");
  return <><ReadingProgress /><MobileToc items={toc} /><div className="reader-layout"><aside className="reader-sidebar"><nav className="reader-toc" aria-label="月报目录"><p>本期目录</p><Toc items={toc} /></nav></aside><div className="reader-body"><Link href="/reports" className="reader-back"><ArrowLeft size={15} />全部趋势月报</Link><header className="reader-heading"><p className="room-muted">{y} 年 {Number(m)} 月 / 研究趋势</p><h1>{report.title}</h1></header><article className="reading-sheet"><Markdown source={report.contentMd} /></article><div className="reader-related"><h2>回到具体研究</h2><p className="room-muted">在论文库中阅读每一篇解读，查看研究方法、实验与局限。</p><Link className="room-text-button" href="/library">浏览论文库</Link></div></div></div></>;
}
