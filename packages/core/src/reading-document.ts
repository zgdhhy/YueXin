import { eq } from "drizzle-orm";
import { db, schema } from "./db";

/** Paper IDs stay unchanged; reports have a reserved namespace in existing reading records. */
export function reportSubject(month: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error("月份格式无效");
  return `report:${month}`;
}

export function getReadingDocument(subject: string) {
  if (subject.startsWith("report:")) {
    const month = subject.slice(7);
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return null;
    const report = db.select().from(schema.trendReports).where(eq(schema.trendReports.month, month)).get();
    return report ? { kind: "report" as const, subject, title: report.title, contentMd: report.contentMd, originalTitle: report.title } : null;
  }
  const row = db.select({ title: schema.digests.titleZh, contentMd: schema.digests.contentMd, originalTitle: schema.papers.title })
    .from(schema.digests).innerJoin(schema.papers, eq(schema.papers.id, schema.digests.paperId)).where(eq(schema.digests.paperId, subject)).get();
  return row ? { ...row, kind: "paper" as const, subject } : null;
}
