import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "paper-library-"));
const { eq } = await import("drizzle-orm");
const { db, schema } = await import("./db");
const { dataPath } = await import("./env");
const lib = await import("./library");

function addNote(paperId: string, section: string, content: string) {
  db.insert(schema.notes).values({ paperId, section, content }).onConflictDoUpdate({ target: [schema.notes.paperId, schema.notes.section], set: { content } }).run();
}
const getMark = (paperId: string) => db.select().from(schema.paperMarks).where(eq(schema.paperMarks.paperId, paperId)).get();

function seedDigest(paperId: string) {
  db.insert(schema.papers).values({ id: paperId, title: `Paper ${paperId}`, abstract: "", authors: [], publishedAt: "2026-10-01" }).onConflictDoNothing().run();
  const d = db.insert(schema.digests).values({ paperId, runId: 1, titleZh: "标题", oneLiner: "一句话", contentMd: "## 一句话总结\n内容" }).returning().get();
  const tag = db.insert(schema.tags).values({ name: `tag-${paperId}` }).returning().get();
  db.insert(schema.digestTags).values({ digestId: d.id, tagId: tag.id }).run();
  db.insert(schema.videos).values({ digestId: d.id, path: `videos/${paperId}/explainer.mp4`, durationSec: 60 }).run();
  db.insert(schema.figures).values({ paperId, label: "Figure 1", caption: "", path: `papers/${paperId}/fig1.png` }).run();
  for (const rel of [`videos/${paperId}/explainer.mp4`, `papers/${paperId}/fig1.png`]) {
    fs.mkdirSync(path.dirname(dataPath(rel)), { recursive: true });
    fs.writeFileSync(dataPath(rel), "x");
  }
  return d;
}

test("历史段落笔记合并为整篇，重复保存不重复合并，清空时删除所有笔记", () => {
  addNote("p3", "", "整篇");
  addNote("p3", "背景", "第一版");
  addNote("p3", "背景", "第二版");
  assert.deepEqual(lib.listNotes("p3").map((n) => [n.section, n.content]).sort(), [["", "整篇"], ["背景", "第二版"]]);
  assert.equal(lib.getWholeNote("p3"), "整篇\n\n第二版");
  lib.saveWholeNote("p3", lib.getWholeNote("p3"));
  lib.saveWholeNote("p3", lib.getWholeNote("p3"));
  assert.deepEqual(lib.listNotes("p3").map(n => [n.section, n.content]), [["", "整篇\n\n第二版"]]);
  const source = "## 标题\n\n**原样保留**  \n\n";
  lib.saveWholeNote("p3", source);
  assert.equal(lib.getWholeNote("p3"), source, "Saving must not remove the active blank line or Markdown hard-break spaces");
  lib.saveWholeNote("p3", "  ");
  assert.equal(lib.getWholeNote("p3"), "");
  assert.equal(lib.listNotes("p3").length, 0);
});

test("删除解读：清理数据与文件，论文不再推荐", () => {
  const d = seedDigest("2610.00001");
  addNote("2610.00001", "", "笔记");
  db.insert(schema.paperMarks).values({ paperId: "2610.00001", favorite: true }).run();
  assert.equal(lib.deleteDigests([d.id]), 1);
  assert.equal(db.select().from(schema.digests).all().length, 0);
  assert.equal(db.select().from(schema.videos).all().length, 0);
  assert.equal(db.select().from(schema.figures).all().length, 0);
  assert.equal(db.select().from(schema.digestTags).all().length, 0);
  assert.equal(lib.listNotes("2610.00001").length, 0);
  assert.equal(fs.existsSync(dataPath("videos", "2610.00001")), false);
  assert.equal(fs.existsSync(dataPath("papers", "2610.00001")), false);
  assert.deepEqual([getMark("2610.00001")?.notInterested, getMark("2610.00001")?.favorite], [true, false]);
  assert.ok(lib.notInterestedPaperIds().has("2610.00001"));
});

test("有运行正在处理时拒绝删除", () => {
  const d = seedDigest("2610.00002");
  db.insert(schema.runs).values({ kind: "digest", trigger: "manual", status: "running", params: { videoDigestId: d.id } }).run();
  assert.throws(() => lib.deleteDigests([d.id]), /正在处理/);
  assert.equal(db.select().from(schema.digests).all().length, 1);
});
