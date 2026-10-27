import Link from "next/link";
import { BookOpenText, Clapperboard, Eye, EyeOff, RefreshCw, Video } from "lucide-react";
import { db, schema } from "@paper/core";
import { regenerateDigest, rerenderVideo, setDigestStatus } from "../actions";
import { listDigests } from "@/lib/data";
import { SubmitButton } from "@/components/admin-client";
import { Card, EmptyState, PageHeader, StatusBadge, Tag, Input, buttonCls } from "@/components/ui";

export default async function DigestsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q.trim() : "";
  const status = params.status === "published" || params.status === "hidden" ? params.status : "";
  const all = listDigests({ includeHidden: true });
  const digests = all.filter(d => (!status || d.status === status) && (!q || `${d.titleZh} ${d.paperTitle} ${d.paperId}`.toLowerCase().includes(q.toLowerCase())));
  const videos = new Map(
    db
      .select({ id: schema.videos.digestId, d: schema.videos.durationSec })
      .from(schema.videos)
      .all()
      .map((v) => [v.id, v.d]),
  );
  return (
    <>
      <PageHeader title="内容管理" description={`共 ${all.length} 篇解读。预览内容、管理发布状态，或重新生成解读与视频。`} />
      <form className="admin-digest-toolbar" action="/admin/digests"><Input name="q" defaultValue={q} placeholder="搜索标题或 arXiv ID" aria-label="搜索解读" /><select name="status" defaultValue={status} aria-label="发布状态"><option value="">全部状态</option><option value="published">已上线</option><option value="hidden">已下线</option></select><button type="submit" className={buttonCls("secondary")}>筛选</button>{(q || status) && <Link href="/admin/digests" className={buttonCls("ghost")}>清除</Link>}</form>
      <Card padded={false}>
        {digests.length ? (
          <ul className="admin-digest-list divide-y divide-slate-100">
            {digests.map((d) => {
              const dur = videos.get(d.id);
              return (
                <li key={d.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-4 sm:px-6">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <Link href={`/admin/digests/${d.id}`} className="font-medium text-slate-900 hover:text-indigo-700">
                        {d.titleZh}
                      </Link>
                      {d.notable && <Tag tone="amber">近期重要</Tag>}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                      <span>{d.createdAt.slice(0, 10)}</span>
                      <span className="font-mono">arXiv:{d.paperId}</span>
                      {dur ? (
                        <span className="inline-flex items-center gap-1 text-sky-600">
                          <Video className="h-3.5 w-3.5" />
                          {Math.floor(dur / 60)}:{String(Math.round(dur % 60)).padStart(2, "0")}
                        </span>
                      ) : (
                        <span className="text-slate-400">无视频</span>
                      )}
                      {d.tags.slice(0, 4).map((t) => (
                        <Tag key={t}>{t}</Tag>
                      ))}
                    </div>
                  </div>
                  <StatusBadge status={d.status} />
                  <div className="-ml-2 flex w-full flex-wrap items-center gap-1 sm:ml-0 sm:w-auto">
                    <form action={setDigestStatus}>
                      <input type="hidden" name="id" value={d.id} />
                      <input type="hidden" name="status" value={d.status === "published" ? "hidden" : "published"} />
                      <SubmitButton variant="ghost" size="sm">
                        {d.status === "published" ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                        {d.status === "published" ? "下线" : "上线"}
                      </SubmitButton>
                    </form>
                    <form action={rerenderVideo}>
                      <input type="hidden" name="digestId" value={d.id} />
                      <SubmitButton variant="ghost" size="sm" confirm="重新生成分镜并渲染视频，需要几分钟，确定吗？">
                        <Clapperboard className="h-3.5 w-3.5" />
                        重做视频
                      </SubmitButton>
                    </form>
                    <form action={regenerateDigest}>
                      <input type="hidden" name="paperId" value={d.paperId} />
                      <SubmitButton variant="ghost" size="sm" confirm="重新解读会覆盖现有内容并重做视频，确定吗？">
                        <RefreshCw className="h-3.5 w-3.5" />
                        重新解读
                      </SubmitButton>
                    </form>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyState icon={BookOpenText} title={all.length ? "没有匹配的解读" : "还没有生成解读"}>
            <Link href={all.length ? "/admin/digests" : "/admin#new-run"} className="text-indigo-600">{all.length ? "清除筛选，查看全部内容" : "新建第一篇解读任务"}</Link>
          </EmptyState>
        )}
      </Card>
    </>
  );
}
