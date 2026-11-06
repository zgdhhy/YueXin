import { and, eq, gte, lt } from "drizzle-orm";
import { db, schema } from "../db";
import { env } from "../env";
import { llmForStage } from "../llm";
import { trendPrompt } from "../prompts/trend";
import { requirementsFor } from "../requirements";
import type { Notice } from "./notify";
import type { Log } from "./select";

/** 默认报告上个月（月初触发时） */
export function defaultMonth(now = new Date()) {
  const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthRange(month: string) {
  const [y, m] = month.split("-").map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1)).toISOString();
  const end = new Date(Date.UTC(y, m, 1)).toISOString();
  return { start, end };
}

function parseReport(text: string) {
  const m = text.match(/^\s*(?:```\w*\s*)?---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/);
  if (!m) throw new Error("月报输出缺少元信息块");
  const title = m[1].match(/title:\s*(.+)/)?.[1]?.trim();
  if (!title) throw new Error("月报缺少标题");
  return { title, contentMd: m[2].replace(/```\s*$/, "").trim() };
}

/** 按当前（或运行锁定的）写作要求生成月报，不写库；当月没有解读时返回 null。试写也用它 */
export async function generateReport(month: string, log: Log): Promise<{ parsed: { title: string; contentMd: string }; versionId: number } | null> {
  const { start, end } = monthRange(month);
  const digests = db
    .select()
    .from(schema.digests)
    .where(and(gte(schema.digests.createdAt, start), lt(schema.digests.createdAt, end)))
    .all();
  if (!digests.length) {
    log(`${month} 没有解读，跳过月报`);
    return null;
  }

  const tagCount = new Map<string, number>();
  const papers = digests
    .map((d) => {
      const tags = db
        .select({ name: schema.tags.name })
        .from(schema.digestTags)
        .innerJoin(schema.tags, eq(schema.tags.id, schema.digestTags.tagId))
        .where(eq(schema.digestTags.digestId, d.id))
        .all()
        .map((t) => t.name);
      tags.forEach((t) => tagCount.set(t, (tagCount.get(t) ?? 0) + 1));
      const alternates = db
        .select({ title: schema.papers.title, reason: schema.candidates.reason })
        .from(schema.candidates)
        .innerJoin(schema.papers, eq(schema.papers.id, schema.candidates.paperId))
        .where(and(eq(schema.candidates.runId, d.runId), eq(schema.candidates.role, "alternate")))
        .all();
      return [
        `### [${d.titleZh}](/papers/${d.paperId})（${d.createdAt.slice(0, 10)}${d.notable ? "，近期重要论文" : ""}）`,
        `一句话：${d.oneLiner}`,
        d.pickReason ? `入选理由：${d.pickReason}` : "",
        `标签：${tags.join("、")}`,
        alternates.length ? `同期备选：${alternates.map((a) => `${a.title}（${a.reason}）`).join("；")}` : "",
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n\n");
  const tags = [...tagCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([t, c]) => `${t} ×${c}`)
    .join("、");

  const prevMonth = defaultMonth(new Date(`${month}-15T00:00:00Z`));
  const prev = db.select().from(schema.trendReports).where(eq(schema.trendReports.month, prevMonth)).get();

  const llm = llmForStage("report");
  const requirements = requirementsFor("report");
  log(`撰写 ${month} 趋势月报（${digests.length} 篇解读，${llm.label}，写作要求 v${requirements.number}）…`);
  let parsed: ReturnType<typeof parseReport> | undefined;
  let lastErr: unknown;
  for (let i = 0; i < 2 && !parsed; i++) {
    try {
      parsed = parseReport(
        await llm.generate({
          system: requirements.content,
          prompt: trendPrompt({ month, papers, tags, previous: prev ? `${prev.title}\n${prev.contentMd.slice(0, 3000)}` : "" }),
        }),
      );
    } catch (e) {
      lastErr = e;
      log(`输出格式不符，重试：${String(e)}`);
    }
  }
  if (!parsed) throw lastErr;
  return { parsed, versionId: requirements.id };
}

/** 生成并保存月报；当月没有解读时返回 null */
export async function writeTrendReport(month: string, log: Log): Promise<{ month: string; title: string } | null> {
  const result = await generateReport(month, log);
  if (!result) return null;
  const { parsed, versionId } = result;
  const set = { ...parsed, requirementsVersionId: versionId };
  db.insert(schema.trendReports)
    .values({ month, ...set })
    .onConflictDoUpdate({ target: schema.trendReports.month, set: { ...set, createdAt: new Date().toISOString() } })
    .run();
  log(`月报完成：《${parsed.title}》`);
  return { month, title: parsed.title };
}

export function reportNotice(r: { month: string; title: string }): Notice {
  const row = db.select().from(schema.trendReports).where(eq(schema.trendReports.month, r.month)).get()!;
  const summary = row.contentMd.match(/## 本月一句话\s*\n+([^\n#]+)/)?.[1]?.trim() ?? "";
  return {
    title: `AI 趋势月报 · ${r.month}`,
    items: [{ title: r.title, summary, url: `${env.siteUrl}/reports/${r.month}` }],
  };
}
