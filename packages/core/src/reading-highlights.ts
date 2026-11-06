import { and, asc, eq } from "drizzle-orm";
import { db, schema } from "./db";

export type ReadingHighlight = typeof schema.readingHighlights.$inferSelect;
export type HighlightAnchor = Pick<ReadingHighlight, "quote" | "prefix" | "suffix" | "start">;

export function listReadingHighlights(subjectId: string): ReadingHighlight[] {
  return db.select().from(schema.readingHighlights).where(eq(schema.readingHighlights.subjectId, subjectId)).orderBy(asc(schema.readingHighlights.start), asc(schema.readingHighlights.id)).all();
}

export function addReadingHighlight(subjectId: string, anchor: HighlightAnchor, options: { color?: string; comment?: string } = {}) {
  if (!anchor.quote.trim() || anchor.quote.length > 5000 || !Number.isSafeInteger(anchor.start) || anchor.start < 0 || anchor.prefix.length > 80 || anchor.suffix.length > 80) throw new Error("请选择有效的正文文字（最多 5000 字符）");
  const color = options.color ?? "#ffe066", comment = options.comment ?? "";
  if (!/^#[0-9a-f]{6}$/i.test(color)) throw new Error("请选择有效的高亮颜色");
  if (comment.length > 5000) throw new Error("批注不能超过 5000 字符");
  const existing = listReadingHighlights(subjectId).find(item => item.start === anchor.start && item.quote === anchor.quote);
  if (existing) return db.update(schema.readingHighlights).set({ color, comment: comment || existing.comment }).where(eq(schema.readingHighlights.id, existing.id)).returning().get()!;
  return db.insert(schema.readingHighlights).values({ subjectId, ...anchor, color, comment }).returning().get();
}

export function updateReadingHighlight(subjectId: string, id: number, comment: string, options: { color?: string; anchor?: HighlightAnchor } = {}) {
  if (comment.length > 5000) throw new Error("批注不能超过 5000 字符");
  if (options.color && !/^#[0-9a-f]{6}$/i.test(options.color)) throw new Error("请选择有效的高亮颜色");
  const anchor = options.anchor;
  if (anchor && (!anchor.quote.trim() || anchor.quote.length > 5000 || !Number.isSafeInteger(anchor.start) || anchor.start < 0 || anchor.prefix.length > 80 || anchor.suffix.length > 80)) throw new Error("请选择有效的正文文字");
  const result = db.update(schema.readingHighlights).set({ comment, ...(options.color ? { color: options.color } : {}), ...(anchor ? { quote: anchor.quote, start: anchor.start, prefix: anchor.prefix, suffix: anchor.suffix } : {}) }).where(and(eq(schema.readingHighlights.subjectId, subjectId), eq(schema.readingHighlights.id, id))).returning().get();
  if (!result) throw new Error("高亮标记不存在");
  return result;
}

export function removeReadingHighlight(subjectId: string, id: number) {
  db.delete(schema.readingHighlights).where(and(eq(schema.readingHighlights.subjectId, subjectId), eq(schema.readingHighlights.id, id))).run();
}
