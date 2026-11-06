import { and, asc, desc, eq, inArray } from "drizzle-orm";
import fs from "node:fs";
import { db, schema, dataPath, listMarks, listNotes } from "@paper/core";

const d = schema.digests;

export type DigestCard = {
  id: number;
  paperId: string;
  titleZh: string;
  oneLiner: string;
  pickReason: string | null;
  notable: boolean;
  createdAt: string;
  paperTitle: string;
  organization: string | null;
  tags: string[];
  /** 封面：论文第一张原图（相对 DATA_DIR） */
  cover: string | null;
  videoSec: number | null;
  /** 视频文件（相对 DATA_DIR） */
  videoPath: string | null;
  /** 解读字数 */
  chars: number;
  notInterested: boolean;
};

function enrich<T extends { id: number; paperId: string }>(rows: T[]) {
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const links = db
    .select({ digestId: schema.digestTags.digestId, name: schema.tags.name })
    .from(schema.digestTags)
    .innerJoin(schema.tags, eq(schema.tags.id, schema.digestTags.tagId))
    .where(inArray(schema.digestTags.digestId, ids))
    .all();
  const figs = db
    .select({ paperId: schema.figures.paperId, path: schema.figures.path })
    .from(schema.figures)
    .where(
      inArray(
        schema.figures.paperId,
        rows.map((r) => r.paperId),
      ),
    )
    .orderBy(asc(schema.figures.id))
    .all();
  const vids = db
    .select({ digestId: schema.videos.digestId, sec: schema.videos.durationSec, path: schema.videos.path })
    .from(schema.videos)
    .where(inArray(schema.videos.digestId, ids))
    .all();
  const marks = new Map(listMarks().map((m) => [m.paperId, m]));
  return rows.map((r) => {
    return {
      ...r,
      tags: links.filter((l) => l.digestId === r.id).map((l) => l.name),
      cover: figs.find((f) => f.paperId === r.paperId && fs.existsSync(dataPath(f.path)))?.path ?? null,
      videoSec: vids.find((v) => v.digestId === r.id)?.sec ?? null,
      videoPath: vids.find((v) => v.digestId === r.id)?.path ?? null,
      notInterested: marks.get(r.paperId)?.notInterested ?? false,
    };
  });
}

/** 全部解读；历史「不感兴趣」标记不影响展示，只在后台显示 */
export function listDigests(opts: { ids?: number[] } = {}): DigestCard[] {
  const conds = [];
  if (opts.ids) conds.push(inArray(d.id, opts.ids.length ? opts.ids : [-1]));
  const rows = db
    .select({
      id: d.id,
      paperId: d.paperId,
      titleZh: d.titleZh,
      oneLiner: d.oneLiner,
      pickReason: d.pickReason,
      notable: d.notable,
      createdAt: d.createdAt,
      contentMd: d.contentMd,
      paperTitle: schema.papers.title,
      organization: schema.papers.organization,
    })
    .from(d)
    .innerJoin(schema.papers, eq(schema.papers.id, d.paperId))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(d.createdAt))
    .all();
  return enrich(rows).map(({ contentMd, ...r }) => ({ ...r, chars: contentMd.length }));
}

export function getDigestByPaper(paperId: string) {
  const row = db
    .select()
    .from(d)
    .innerJoin(schema.papers, eq(schema.papers.id, d.paperId))
    .where(eq(d.paperId, paperId))
    .get();
  if (!row) return null;
  const [withTags] = enrich([row.digests]);
  const notes = listNotes(paperId);
  const alternates = db
    .select({ paperId: schema.candidates.paperId, reason: schema.candidates.reason, title: schema.papers.title })
    .from(schema.candidates)
    .innerJoin(schema.papers, eq(schema.papers.id, schema.candidates.paperId))
    .where(and(eq(schema.candidates.runId, row.digests.runId), eq(schema.candidates.role, "alternate")))
    .all();
  const figures = db.select().from(schema.figures).where(eq(schema.figures.paperId, paperId)).all();
  const video = db.select().from(schema.videos).where(eq(schema.videos.digestId, row.digests.id)).get();
  // 前后两篇，用于文末导航
  const all = listDigests();
  const idx = all.findIndex((x) => x.id === row.digests.id);
  return {
    digest: withTags,
    paper: row.papers,
    alternates,
    figures,
    video,
    notes,
    newer: idx > 0 ? all[idx - 1] : null,
    older: idx >= 0 && idx < all.length - 1 ? all[idx + 1] : null,
  };
}

/** 标签与篇数 */
export function tagCounts() {
  const counts = new Map<string, number>();
  for (const x of listDigests()) for (const t of x.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
  return [...counts.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
}

export function digestIdsByTag(name: string) {
  return db
    .select({ id: schema.digestTags.digestId })
    .from(schema.digestTags)
    .innerJoin(schema.tags, eq(schema.tags.id, schema.digestTags.tagId))
    .where(eq(schema.tags.name, name))
    .all()
    .map((r) => r.id);
}

export function latestReport() {
  return db.select().from(schema.trendReports).orderBy(desc(schema.trendReports.month)).get() ?? null;
}

export function fileUrl(rel: string) {
  return `/files/${rel.split("/").map(encodeURIComponent).join("/")}`;
}

export function fmtVideo(sec: number) {
  return `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, "0")}`;
}

/** 中文约 500 字/分钟 */
export function readMinutes(chars: number) {
  return Math.max(1, Math.round(chars / 500));
}

export function reportLead(md: string) {
  return md.match(/## 本月一句话\s*\n+([^\n#]+)/)?.[1]?.trim() ?? "";
}
