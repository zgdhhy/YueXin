import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "../db";
import { generateJson, llmForStage } from "../llm";
import { RERANK_SYSTEM, rerankPrompt } from "../prompts/rerank";
import { getSetting } from "../settings";
import { fetchArxivByIds, fetchArxivRecent } from "../sources/arxiv";
import { fetchHfDaily } from "../sources/hf";
import { fetchNotable } from "../sources/semanticScholar";
import type { PaperMeta } from "../sources/types";
import { ruleScore } from "./score";

export type Log = (s: string) => void;

export interface Selection {
  picks: { paperId: string; reason: string; notable: boolean }[];
  alternates: { paperId: string; reason: string }[];
}

function upsertPapers(list: PaperMeta[]) {
  for (const p of list) {
    db.insert(schema.papers)
      .values(p)
      .onConflictDoUpdate({
        target: schema.papers.id,
        set: {
          upvotes: p.upvotes,
          ...(p.citations != null ? { citations: p.citations } : {}),
          ...(p.organization ? { organization: p.organization } : {}),
          ...(p.keywords.length ? { keywords: p.keywords } : {}),
          ...(p.arxivCategories.length ? { arxivCategories: p.arxivCategories } : {}),
          ...(p.githubUrl ? { githubUrl: p.githubUrl } : {}),
        },
      })
      .run();
  }
}

function enabledTopics() {
  return db.select().from(schema.topics).where(eq(schema.topics.enabled, true)).all();
}

/** 采集新论文与近期重要论文，写入 papers 表 */
export async function collect(log: Log, needNotable: boolean) {
  const sel = getSetting("selection");
  const topics = enabledTopics();
  const fresh = new Map<string, PaperMeta>();

  if (sel.sources.hf) {
    const hf = await fetchHfDaily(sel.lookbackDays);
    log(`HF Daily Papers：${hf.length} 篇`);
    hf.forEach((p) => fresh.set(p.id, p));
  }
  if (sel.sources.arxiv) {
    const cats = [...new Set(topics.flatMap((t) => t.arxivCategories))];
    try {
      const ax = await fetchArxivRecent(cats, sel.lookbackDays);
      log(`arXiv 最新（${cats.join(", ")}）：${ax.length} 篇`);
      for (const p of ax) {
        const prev = fresh.get(p.id);
        fresh.set(p.id, prev ? { ...prev, arxivCategories: p.arxivCategories } : p);
      }
    } catch (e) {
      // 单个来源失败不影响整体选题
      log(`arXiv 获取失败，跳过：${String(e)} ${String((e as Error).cause ?? "")}`);
    }
  }

  let notable: PaperMeta[] = [];
  if (needNotable) {
    // 每个主题取前两个关键词组成检索式
    const queries = topics.map((t) =>
      t.keywords
        .slice(0, 2)
        .map((k) => `"${k}"`)
        .join(" | "),
    );
    const top = await fetchNotable(queries, sel.lookbackDays + 7, sel.notableLookbackDays);
    const metas = await fetchArxivByIds(top.map((t) => t.arxivId));
    const cites = new Map(top.map((t) => [t.arxivId, t.citations]));
    notable = metas.map((m) => ({ ...m, citations: cites.get(m.id) ?? 0 }));
    log(`近期重要论文（Semantic Scholar 高引）：${notable.length} 篇`);
  }

  upsertPapers([...fresh.values(), ...notable]);
  return { fresh: [...fresh.values()], notable };
}

function shortlist(list: PaperMeta[], size: number, exclude: Set<string>) {
  const sel = getSetting("selection");
  const topics = enabledTopics();
  return (
    list
      .filter((p) => !exclude.has(p.id))
      .map((p) => ({ paper: p, score: ruleScore(p, topics, sel.institutions) }))
      // 与关注方向无关、又不够热门的直接排除
      .filter((x) => x.score.topic > 0 || x.score.popularity > 12)
      .sort((a, b) => b.score.total - a.score.total)
      .slice(0, size)
  );
}

function describe(items: ReturnType<typeof shortlist>) {
  return items
    .map(({ paper: p, score }) => {
      const signals = [
        p.citations != null ? `引用 ${p.citations}` : `HF 点赞 ${p.upvotes}`,
        p.organization ? `机构 ${p.organization}` : "",
        score.matchedTopics.length ? `相关方向 ${score.matchedTopics.join("/")}` : "",
        `发表 ${p.publishedAt.slice(0, 10)}`,
      ].filter(Boolean);
      const authors = p.authors.slice(0, 6).join(", ") + (p.authors.length > 6 ? " 等" : "");
      return `### ${p.id} — ${p.title}\n${signals.join("；")}\n作者：${authors}\n${p.abstract}`;
    })
    .join("\n\n");
}

export function recentHistory(limit = 30) {
  return db
    .select({
      id: schema.digests.paperId,
      title: schema.digests.titleZh,
      oneLiner: schema.digests.oneLiner,
      date: schema.digests.createdAt,
    })
    .from(schema.digests)
    .orderBy(desc(schema.digests.createdAt))
    .limit(limit)
    .all();
}

const rerankSchema = z.object({
  picks: z.array(z.object({ id: z.string(), reason: z.string() })).min(1),
  alternates: z.array(z.object({ id: z.string(), reason: z.string() })),
});

/** 选出本次的推荐与备选；paperIds 非空时跳过选题，直接使用指定论文 */
export async function selectPapers(runId: number, picks: number, log: Log, paperIds?: string[]): Promise<Selection> {
  if (paperIds?.length) {
    const metas = await fetchArxivByIds(paperIds);
    upsertPapers(metas);
    log(`手动指定论文：${metas.map((m) => m.id).join(", ")}`);
    return { picks: metas.map((m) => ({ paperId: m.id, reason: "手动指定", notable: false })), alternates: [] };
  }

  const sel = getSetting("selection");
  let notablePicks = 0;
  for (let i = 0; i < picks; i++) if (Math.random() < sel.notableRatio) notablePicks++;
  log(`本次推荐 ${picks} 篇，其中近期重要论文名额 ${notablePicks} 个`);

  const { fresh, notable } = await collect(log, notablePicks > 0);
  const done = new Set(
    db
      .select({ id: schema.digests.paperId })
      .from(schema.digests)
      .all()
      .map((r) => r.id),
  );
  const freshList = shortlist(fresh, sel.shortlistSize, done);
  const notableList = notablePicks ? shortlist(notable, Math.ceil(sel.shortlistSize / 2), done) : [];
  if (!freshList.length && !notableList.length) throw new Error("没有符合条件的候选论文");
  log(`初筛后候选：新论文 ${freshList.length} 篇，近期重要论文 ${notableList.length} 篇`);

  const all = [
    ...freshList.map((x) => ({ ...x, notable: false })),
    ...notableList.map((x) => ({ ...x, notable: true })),
  ];
  db.insert(schema.candidates)
    .values(all.map((x) => ({ runId, paperId: x.paper.id, notable: x.notable, ruleScore: x.score.total })))
    .run();

  const topics = enabledTopics()
    .map((t) => `- ${t.name}（权重 ${t.weight}）：${t.keywords.join(", ")}`)
    .join("\n");
  const history = recentHistory()
    .map((h) => `- ${h.date.slice(0, 10)} ${h.title}：${h.oneLiner}`)
    .join("\n");

  const llm = llmForStage("rerank");
  log(`大模型精选中（${llm.label}）…`);
  const ids = new Set(all.map((x) => x.paper.id));
  const result = await generateJson(
    llm,
    {
      system: RERANK_SYSTEM,
      prompt: rerankPrompt({
        picks,
        notablePicks: notableList.length ? notablePicks : 0,
        alternates: sel.alternates,
        topics,
        history,
        fresh: describe(freshList),
        notable: describe(notableList),
      }),
    },
    rerankSchema.refine((r) => [...r.picks, ...r.alternates].every((p) => ids.has(p.id)), "id 必须来自候选列表"),
  );

  const notableIds = new Set(notableList.map((x) => x.paper.id));
  const pickIds = new Set(result.picks.map((p) => p.id));
  const selection: Selection = {
    picks: result.picks
      .slice(0, picks)
      .map((p) => ({ paperId: p.id, reason: p.reason, notable: notableIds.has(p.id) })),
    alternates: result.alternates
      .filter((a) => !pickIds.has(a.id))
      .slice(0, sel.alternates)
      .map((a) => ({ paperId: a.id, reason: a.reason })),
  };
  for (const p of selection.picks) setRole(runId, p.paperId, "pick", p.reason);
  for (const a of selection.alternates) setRole(runId, a.paperId, "alternate", a.reason);
  log(
    `推荐：${selection.picks.map((p) => p.paperId).join(", ")}；备选：${selection.alternates.map((a) => a.paperId).join(", ")}`,
  );
  return selection;
}

function setRole(runId: number, paperId: string, role: "pick" | "alternate", reason: string) {
  const row = db
    .select()
    .from(schema.candidates)
    .where(eq(schema.candidates.runId, runId))
    .all()
    .find((r) => r.paperId === paperId);
  if (row) db.update(schema.candidates).set({ role, reason }).where(eq(schema.candidates.id, row.id)).run();
}
