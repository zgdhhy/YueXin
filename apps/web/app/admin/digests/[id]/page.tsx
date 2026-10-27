import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema } from "@paper/core";
import { getDigestByPaper } from "@/lib/data";
import { Markdown, resolveFigures } from "@/components/Markdown";
import { PageHeader, StatusBadge, buttonCls } from "@/components/ui";
import { requireAuth } from "@/lib/auth";

export default async function DigestPreview({ params }: { params: Promise<{ id: string }> }) {
  await requireAuth();
  const id = Number((await params).id);
  if (!Number.isSafeInteger(id)) notFound();
  const row = db.select().from(schema.digests).where(eq(schema.digests.id, id)).get();
  if (!row) notFound();
  const data = getDigestByPaper(row.paperId);
  if (!data) notFound();
  return <><Link href="/admin/digests" className="admin-back">返回内容管理</Link><PageHeader title="解读预览" description="下线内容也可在这里检查。发布与重新生成操作位于内容列表。" actions={row.status === "published" ? <Link href={`/papers/${row.paperId}`} className={buttonCls("secondary")}>查看阅读页面</Link> : <StatusBadge status={row.status} />} /><article className="admin-preview"><StatusBadge status={row.status} /><h2>{row.titleZh}</h2><p>{row.oneLiner}</p><Markdown source={resolveFigures(row.contentMd, data.figures)} /></article></>;
}
