import Link from "next/link";
import { BookOpenText, Clapperboard, FileBarChart, RefreshCw, Trash2, Video } from "lucide-react";
import { desc } from "drizzle-orm";
import { db, schema } from "@paper/core";
import { regenerateDigests, removeDigests, rerenderVideos, triggerTrendReport } from "../actions";
import { listDigests, tagCounts } from "@/lib/data";
import { SubmitButton } from "@/components/admin/admin-client";
import { Card, EmptyState, Input, PageHeader, Tag, buttonCls } from "@/components/admin/ui";
import { cn } from "@/lib/cn";
import { BulkForm } from "./bulk-form";

const PAGE_SIZE = 20;
type Params = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (typeof v === "string" ? v.trim() : "");

/** 当前筛选生成的链接（page 为 1 时省略） */
function href(f: Record<string, string>, page = 1) {
  const q = new URLSearchParams(Object.entries({ ...f, page: page > 1 ? String(page) : "" }).filter(([, v]) => v));
  return `/admin/digests${q.size ? `?${q}` : ""}`;
}

function Tabs({ tab }: { tab: "digests" | "reports" }) {
  return (
    <nav className="admin-tabs" aria-label="内容类型">
      <Link href="/admin/digests" aria-current={tab === "digests" ? "page" : undefined}>解读</Link>
      <Link href="/admin/digests?tab=reports" aria-current={tab === "reports" ? "page" : undefined}>月报</Link>
    </nav>
  );
}

export default async function ContentPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  return (
    <>
      <PageHeader title="内容管理" />
      {params.tab === "reports" ? (
        <>
          <Tabs tab="reports" />
          <Reports />
        </>
      ) : (
        <>
          <Tabs tab="digests" />
          <Digests params={params} />
        </>
      )}
    </>
  );
}

function Digests({ params }: { params: Params }) {
  const filters = { q: one(params.q), tag: one(params.tag), month: one(params.month) };
  const all = listDigests();
  const months = [...new Set(all.map((d) => d.createdAt.slice(0, 7)))];
  const q = filters.q.toLowerCase();
  const matched = all.filter(
    (d) =>
      (!filters.tag || d.tags.includes(filters.tag)) &&
      (!filters.month || d.createdAt.startsWith(filters.month)) &&
      (!q || `${d.titleZh} ${d.paperTitle} ${d.paperId}`.toLowerCase().includes(q)),
  );
  const pages = Math.max(1, Math.ceil(matched.length / PAGE_SIZE));
  const page = Math.min(pages, Math.max(1, Number(one(params.page)) || 1));
  const rows = matched.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const filtered = !!(filters.q || filters.tag || filters.month);
  const backTo = href(filters, page);
  return (
    <>
      <form className="admin-digest-toolbar" action="/admin/digests">
        <Input name="q" defaultValue={filters.q} placeholder="搜索标题或 arXiv ID" aria-label="搜索解读" />
        <select name="tag" defaultValue={filters.tag} aria-label="标签">
          <option value="">全部标签</option>
          {tagCounts().map((t) => <option key={t.name} value={t.name}>{t.name}（{t.count}）</option>)}
        </select>
        <select name="month" defaultValue={filters.month} aria-label="月份">
          <option value="">全部月份</option>
          {months.map((m) => <option key={m} value={m}>{m.replace("-", " 年 ")} 月</option>)}
        </select>
        <button type="submit" className={buttonCls("secondary")}>筛选</button>
        {filtered && <Link href="/admin/digests" className={buttonCls("ghost")}>清除</Link>}
      </form>
      <Card padded={false}>
        {rows.length ? (
          <BulkForm
            actions={
              <>
                <input type="hidden" name="back" value={backTo} />
                <SubmitButton variant="ghost" size="sm" formAction={regenerateDigests} confirm="用当前配置重新解读所选论文，并重做视频？">
                  <RefreshCw className="h-3.5 w-3.5" />重新解读
                </SubmitButton>
                <SubmitButton variant="ghost" size="sm" formAction={rerenderVideos} confirm="为所选解读重做视频？每篇需要几分钟。">
                  <Clapperboard className="h-3.5 w-3.5" />重做视频
                </SubmitButton>
                <SubmitButton variant="danger" size="sm" formAction={removeDigests} confirm={"删除所选解读？\n视频、原图和笔记会一并删除，这些论文以后不会再被推荐。"}>
                  <Trash2 className="h-3.5 w-3.5" />删除
                </SubmitButton>
              </>
            }
          >
            <ul className="divide-y divide-slate-100">
              {rows.map((d) => (
                <li key={d.id} className="admin-bulk-row">
                  <input type="checkbox" name="ids" value={d.id} aria-label={`选择：${d.titleZh}`} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link href={`/admin/digests/${d.id}`} className="font-medium text-slate-900 hover:text-indigo-700">{d.titleZh}</Link>
                      {d.notInterested && <Tag>不感兴趣</Tag>}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                      <span>{d.createdAt.slice(0, 10)}</span>
                      <span className="font-mono">arXiv:{d.paperId}</span>
                      {d.videoSec ? (
                        <span className="inline-flex items-center gap-1 text-sky-600">
                          <Video className="h-3.5 w-3.5" />
                          {Math.floor(d.videoSec / 60)}:{String(Math.round(d.videoSec % 60)).padStart(2, "0")}
                        </span>
                      ) : (
                        <span className="text-slate-400">无视频</span>
                      )}
                      {d.tags.slice(0, 4).map((t) => <Tag key={t}>{t}</Tag>)}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </BulkForm>
        ) : (
          <EmptyState icon={BookOpenText} title={all.length ? "没有匹配的解读" : "还没有生成解读"}>
            <Link href={all.length ? "/admin/digests" : "/admin#new-run"} className="text-indigo-600">{all.length ? "清除筛选" : "新建第一篇解读"}</Link>
          </EmptyState>
        )}
      </Card>
      {pages > 1 && (
        <nav className="admin-pager" aria-label="分页">
          <span>共 {matched.length} 篇 · 第 {page}/{pages} 页</span>
          <Link href={href(filters, page - 1)} aria-disabled={page === 1} className={cn(buttonCls("secondary", "sm"), page === 1 && "pointer-events-none opacity-50")}>上一页</Link>
          <Link href={href(filters, page + 1)} aria-disabled={page === pages} className={cn(buttonCls("secondary", "sm"), page === pages && "pointer-events-none opacity-50")}>下一页</Link>
        </nav>
      )}
    </>
  );
}

function Reports() {
  const reports = db.select().from(schema.trendReports).orderBy(desc(schema.trendReports.month)).all();
  return (
    <>
      <form action={triggerTrendReport} className="admin-digest-toolbar">
        <Input name="month" type="month" aria-label="月份" />
        <SubmitButton variant="secondary" pendingText="提交中…">生成月报</SubmitButton>
      </form>
      <Card padded={false}>
        {reports.length ? (
          <ul className="divide-y divide-slate-100">
            {reports.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-4 sm:px-6">
                <div className="min-w-0 flex-1">
                  <Link href={`/reports/${r.month}`} className="font-medium text-slate-900 hover:text-indigo-700">{r.title}</Link>
                  <div className="mt-1 text-xs text-slate-500">{r.month.replace("-", " 年 ")} 月</div>
                </div>
                <form action={triggerTrendReport}>
                  <input type="hidden" name="month" value={r.month} />
                  <SubmitButton variant="ghost" size="sm" confirm={`重新生成 ${r.month} 的月报？会覆盖现有内容。`}>
                    <RefreshCw className="h-3.5 w-3.5" />重做
                  </SubmitButton>
                </form>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState icon={FileBarChart} title="还没有月报" />
        )}
      </Card>
    </>
  );
}
