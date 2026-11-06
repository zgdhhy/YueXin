import fs from "node:fs";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { db, schema } from "./db";
import { dataPath } from "./env";

/**
 * 个人知识库：历史标记、笔记、解读修订与删除。
 * 前台已不再写入收藏与阅读状态；历史标记只读，删除解读时写入不感兴趣，供选题参考。
 */
export type PaperMark = typeof schema.paperMarks.$inferSelect;

const now = () => new Date().toISOString();

export function listMarks(): PaperMark[] {
  return db.select().from(schema.paperMarks).all();
}

/** 不再推荐的论文：标记为不感兴趣的（含已删除解读的） */
export function notInterestedPaperIds() {
  return new Set(
    db
      .select({ id: schema.paperMarks.paperId })
      .from(schema.paperMarks)
      .where(eq(schema.paperMarks.notInterested, true))
      .all()
      .map((r) => r.id),
  );
}

// ---------- 笔记 ----------

export type Note = typeof schema.notes.$inferSelect;
/** 整篇笔记的 section */
const WHOLE_NOTE = "";

export function listNotes(paperId?: string): Note[] {
  const q = db.select().from(schema.notes);
  return (paperId ? q.where(eq(schema.notes.paperId, paperId)) : q).all();
}

/** Read historical section notes together with the whole-document note, without discarding content. */
export function getWholeNote(paperId: string): string {
  return listNotes(paperId).sort((a, b) => Number(!!a.section) - Number(!!b.section))
    .map(note => note.content).filter(content => content.trim()).join("\n\n");
}

/** A document now has one notebook; saving consolidates historical section entries atomically. */
export function saveWholeNote(paperId: string, content: string) {
  db.transaction(tx => {
    tx.delete(schema.notes).where(eq(schema.notes.paperId, paperId)).run();
    if (content.trim()) tx.insert(schema.notes).values({ paperId, section: WHOLE_NOTE, content }).run();
  });
}

// ---------- 解读修订 ----------

export type DigestRevision = typeof schema.digestRevisions.$inferSelect;

/** 用标签名重建一篇解读的标签关联 */
export function saveTags(digestId: number, names: string[]) {
  db.delete(schema.digestTags).where(eq(schema.digestTags.digestId, digestId)).run();
  for (const name of names) {
    db.insert(schema.tags).values({ name }).onConflictDoNothing().run();
    const tag = db.select().from(schema.tags).where(eq(schema.tags.name, name)).get()!;
    db.insert(schema.digestTags).values({ digestId, tagId: tag.id }).onConflictDoNothing().run();
  }
}

export function listDigestRevisions(digestId: number): DigestRevision[] {
  return db.select().from(schema.digestRevisions).where(eq(schema.digestRevisions.digestId, digestId)).orderBy(desc(schema.digestRevisions.id)).all();
}

/** 让某个修订对读者生效：正文、标题、一句话和标签都换成这一版 */
export function activateDigestRevision(digestId: number, revisionId: number) {
  const rev = db
    .select()
    .from(schema.digestRevisions)
    .where(and(eq(schema.digestRevisions.id, revisionId), eq(schema.digestRevisions.digestId, digestId)))
    .get();
  if (!rev) throw new Error("修订不存在");
  db.update(schema.digests)
    .set({ titleZh: rev.titleZh, oneLiner: rev.oneLiner, contentMd: rev.contentMd, revisionId: rev.id })
    .where(eq(schema.digests.id, digestId))
    .run();
  saveTags(digestId, rev.tags);
  return rev;
}

/** 升级前的解读还没有修订：用当前内容补一版（可重复调用） */
export function ensureDigestRevisions(digestId?: number) {
  const missing = db.select().from(schema.digests).where(and(isNull(schema.digests.revisionId), digestId == null ? undefined : eq(schema.digests.id, digestId))).all();
  for (const d of missing) {
    const tags = db
      .select({ name: schema.tags.name })
      .from(schema.digestTags)
      .innerJoin(schema.tags, eq(schema.tags.id, schema.digestTags.tagId))
      .where(eq(schema.digestTags.digestId, d.id))
      .all()
      .map((t) => t.name);
    const rev = db
      .insert(schema.digestRevisions)
      .values({ digestId: d.id, runId: d.runId, titleZh: d.titleZh, oneLiner: d.oneLiner, contentMd: d.contentMd, tags, createdAt: d.createdAt })
      .returning({ id: schema.digestRevisions.id })
      .get();
    db.update(schema.digests).set({ revisionId: rev.id }).where(eq(schema.digests.id, d.id)).run();
  }
}

// ---------- 删除 ----------

/**
 * 彻底删除解读：解读与修订、标签关联、讲解脚本、视频、原图与论文缓存、笔记与追问、相关试写。
 * 论文记为不感兴趣，以后不会再被推荐。正在处理这些论文的运行未结束时拒绝删除。
 */
export function deleteDigests(digestIds: number[]) {
  if (!digestIds.length) return 0;
  const rows = db.select({ id: schema.digests.id, paperId: schema.digests.paperId }).from(schema.digests).where(inArray(schema.digests.id, digestIds)).all();
  if (!rows.length) return 0;
  const ids = rows.map((r) => r.id);
  const paperIds = rows.map((r) => r.paperId);
  const busy = db
    .select()
    .from(schema.runs)
    .where(inArray(schema.runs.status, ["queued", "running"]))
    .all()
    .some((r) => (r.params.videoDigestId != null && ids.includes(r.params.videoDigestId)) || r.params.paperIds?.some((p) => paperIds.includes(p)));
  if (busy) throw new Error("有运行正在处理所选解读，请等它结束后再删除");

  db.transaction((tx) => {
    tx.delete(schema.digestTags).where(inArray(schema.digestTags.digestId, ids)).run();
    tx.delete(schema.storyboards).where(inArray(schema.storyboards.digestId, ids)).run();
    tx.delete(schema.explainerScripts).where(inArray(schema.explainerScripts.digestId, ids)).run();
    tx.delete(schema.videos).where(inArray(schema.videos.digestId, ids)).run();
    tx.delete(schema.digests).where(inArray(schema.digests.id, ids)).run();
    tx.delete(schema.digestRevisions).where(inArray(schema.digestRevisions.digestId, ids)).run();
    // 试写对象：论文解读按 arXiv id，讲解脚本按解读 id
    tx.delete(schema.trials).where(inArray(schema.trials.target, [...paperIds, ...ids.map(String)])).run();
    tx.delete(schema.figures).where(inArray(schema.figures.paperId, paperIds)).run();
    tx.delete(schema.notes).where(inArray(schema.notes.paperId, paperIds)).run();
    tx.delete(schema.readingHighlights).where(inArray(schema.readingHighlights.subjectId, paperIds)).run();
    const chats = tx.select({ id: schema.conversations.id }).from(schema.conversations).where(and(eq(schema.conversations.kind, "paper"), inArray(schema.conversations.subject, paperIds))).all().map((c) => c.id);
    if (chats.length) {
      tx.delete(schema.messages).where(inArray(schema.messages.conversationId, chats)).run();
      tx.delete(schema.conversations).where(inArray(schema.conversations.id, chats)).run();
    }
    for (const paperId of paperIds) {
      tx.insert(schema.paperMarks)
        .values({ paperId, notInterested: true })
        .onConflictDoUpdate({ target: schema.paperMarks.paperId, set: { notInterested: true, favorite: false, readState: "unread", progress: 0, updatedAt: now() } })
        .run();
    }
  });
  for (const paperId of paperIds) {
    if (paperId.includes("..")) continue;
    for (const dir of [dataPath("videos", paperId), dataPath("papers", paperId)]) fs.rmSync(dir, { recursive: true, force: true });
  }
  return ids.length;
}
