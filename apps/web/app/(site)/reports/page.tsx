import Link from "next/link";
import { desc } from "drizzle-orm";
import { ArrowRight, FileBarChart } from "lucide-react";
import { db, schema } from "@paper/core";
import { reportLead } from "@/lib/data";

export default function ReportsPage() {
  const reports = db.select().from(schema.trendReports).orderBy(desc(schema.trendReports.month)).all();
  return (
    <div className="collection-page mx-auto max-w-4xl">
      <header className="mb-6 sm:mb-10">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">趋势月报</h1>
        <p className="mt-2 text-stone-500">每月 1 日汇总上个月的全部解读，提炼主线趋势与值得关注的信号。</p>
      </header>
      <div className="space-y-5">
        {reports.map((r) => {
          const [y, m] = r.month.split("-");
          return (
            <Link
              key={r.id}
              href={`/reports/${r.month}`}
              className="report-entry group flex gap-4 rounded-2xl bg-white p-4 ring-1 sm:gap-6 sm:p-6 ring-stone-200/80"
            >
              <div className="report-date flex shrink-0 flex-col items-center justify-center">
                <span className="text-2xl leading-none font-bold">{Number(m)}</span>
                <span className="mt-1 text-[11px] opacity-80">{y} 年</span>
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="text-lg font-semibold leading-snug group-hover:text-indigo-700">{r.title}</h2>
                <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-stone-600">{reportLead(r.contentMd)}</p>
                <span className="mt-3 inline-flex items-center gap-1 text-sm text-indigo-600">
                  阅读月报 <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" />
                </span>
              </div>
            </Link>
          );
        })}
      </div>
      {!reports.length && (
        <div className="rounded-2xl border border-dashed border-stone-300 px-6 py-16 text-center">
          <FileBarChart className="mx-auto h-8 w-8 text-stone-300" />
          <p className="mt-3 text-sm text-stone-500">还没有月报。每月 1 日会自动生成上个月的报告，也可以在后台手动生成。</p>
          <Link href="/library" className="room-text-button mt-4">先浏览论文解读</Link>
        </div>
      )}
    </div>
  );
}
