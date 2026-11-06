import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { Clapperboard, RefreshCw, Trash2 } from "lucide-react";
import { db, schema, getScript, listDigestRevisions, listStyles, versionLabel } from "@paper/core";
import { fileUrl, getDigestByPaper } from "@/lib/data";
import { ScriptEditor } from "./script-editor";
import { Markdown, resolveFigures } from "@/components/Markdown";
import { SubmitButton } from "@/components/admin/admin-client";
import { Card, PageHeader, StatusBadge, Tag, buttonCls, fmtTime } from "@/components/admin/ui";
import { requireAuth } from "@/lib/auth";
import { activateRevision, regenerateDigests, removeDigests, rerenderVideos } from "../../actions";
import { OutputView, SideBySide } from "../../output-views";

export default async function DigestPreview({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireAuth();
  const id = Number((await params).id);
  if (!Number.isSafeInteger(id)) notFound();
  const row = db.select().from(schema.digests).where(eq(schema.digests.id, id)).get();
  if (!row) notFound();
  const data = getDigestByPaper(row.paperId);
  if (!data) notFound();
  const revisions = listDigestRevisions(id);
  const label = (r: (typeof revisions)[number]) => `${fmtTime(r.createdAt).slice(0, -3)} · ${versionLabel(r.requirementsVersionId) ?? "版本未记录"}`;
  const query = await searchParams;
  const tab = query.tab === "video" ? "video" : "text";
  const compareId = Number(query.compare);
  const compare = revisions.find((r) => r.id === compareId && r.id !== row.revisionId);
  const live = revisions.find((r) => r.id === row.revisionId);
  return (
    <>
      <Link href="/admin/digests" className="admin-back">返回内容管理</Link>
      <PageHeader title="解读预览" actions={<Link href={`/papers/${row.paperId}`} className={buttonCls("secondary")}>阅读页面</Link>} />
      <form className="mb-6 flex flex-wrap gap-2">
        <input type="hidden" name="ids" value={row.id} />
        <SubmitButton variant="secondary" size="sm" formAction={regenerateDigests} confirm="用当前配置重新解读这篇论文，并重做视频？新结果会成为一版新修订，旧修订保留。">
          <RefreshCw className="h-3.5 w-3.5" />重新解读
        </SubmitButton>
        <SubmitButton variant="secondary" size="sm" formAction={rerenderVideos} confirm="重新写讲解脚本并生成视频？会覆盖当前脚本，需要几分钟。">
          <Clapperboard className="h-3.5 w-3.5" />重做视频
        </SubmitButton>
        <SubmitButton variant="danger" size="sm" formAction={removeDigests} confirm={"删除这篇解读？\n视频、原图和笔记会一并删除，这篇论文以后不会再被推荐。"}>
          <Trash2 className="h-3.5 w-3.5" />删除
        </SubmitButton>
      </form>
      <nav className="admin-tabs" aria-label="解读内容">
        <Link href={`/admin/digests/${id}`} aria-current={tab === "text" ? "page" : undefined}>正文</Link>
        <Link href={`/admin/digests/${id}?tab=video`} aria-current={tab === "video" ? "page" : undefined}>视频</Link>
      </nav>
      {tab === "video" ? <VideoTab digestId={id} video={data.video} /> : (
        <>
      {revisions.length > 1 && (
          <Card title="修订" padded={false} className="mb-6">
            <ul className="divide-y divide-slate-100">
              {revisions.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 text-sm sm:px-6">
                  <span className="min-w-0 flex-1">{label(r)}</span>
                  {r.id === row.revisionId ? (
                    <StatusBadge status="enabled" />
                  ) : (
                    <>
                      <Link href={`/admin/digests/${id}?compare=${r.id}`} className={buttonCls("ghost", "sm")}>对比</Link>
                      <form action={activateRevision}>
                        <input type="hidden" name="digestId" value={id} />
                        <input type="hidden" name="revisionId" value={r.id} />
                        <SubmitButton variant="secondary" size="sm" confirm="让这一版对读者生效？标题、正文和标签会一起切换，视频不变。">设为生效</SubmitButton>
                      </form>
                    </>
                  )}
                </li>
              ))}
            </ul>
          </Card>
        )}
        {compare && live ? (
          <SideBySide
            left={{ label: <>生效中 · {label(live)}</>, body: <OutputView stage="digest" output={live} figures={data.figures} /> }}
            right={{ label: label(compare), body: <OutputView stage="digest" output={compare} figures={data.figures} /> }}
          />
        ) : (
          <article className="admin-preview">
            {data.digest.notInterested && <Tag>不感兴趣</Tag>}
            <h2>{row.titleZh}</h2>
            <p>{row.oneLiner}</p>
            <Markdown source={resolveFigures(row.contentMd, data.figures)} />
          </article>
        )}
        </>
      )}
    </>
  );
}

/** 视频页签：当前视频 + 讲解脚本编辑 */
function VideoTab({ digestId, video }: { digestId: number; video: { path: string } | undefined }) {
  const script = getScript(digestId);
  const styles = listStyles().map((s) => ({ id: s.id, name: s.enabled ? s.name : `${s.name}（已停用）` }));
  return (
    <div className="space-y-6">
      {video && <video controls preload="metadata" src={fileUrl(video.path)} className="aspect-video w-full max-w-3xl rounded-lg bg-slate-900" />}
      {script ? (
        <ScriptEditor key={script.updatedAt} digestId={digestId} script={script} styles={styles} thumbBase="/files" />
      ) : (
        <Card title="还没有讲解脚本">
          <p className="text-sm text-slate-500">{video ? "这个视频由旧流程生成。" : ""}点上方「重做视频」，会先写讲解脚本，再逐个镜头写动画代码并渲染。</p>
        </Card>
      )}
    </div>
  );
}
