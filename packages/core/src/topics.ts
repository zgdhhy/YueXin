import { desc, eq, gte } from "drizzle-orm";
import { db, schema } from "./db";
import type { TopicDraft } from "./db/schema";
import { topicMatchScore } from "./pipeline/score";

/**
 * 主题（关注方向）：读者配置的输入。描述交给大模型精选参考；
 * 分类、关键词、权重用于规则初筛，通常由方向助手生成。
 */
export type Topic = typeof schema.topics.$inferSelect;
export type { TopicDraft };

const DEFAULT_TOPICS: Omit<Topic, "id" | "enabled">[] = [
  { name: "大语言模型", description: "大模型的预训练、扩展规律与架构演进", arxivCategories: ["cs.CL"], keywords: ["language model", "LLM", "pretraining", "scaling", "transformer", "attention"], weight: 1.5 },
  { name: "智能体 Agent", description: "让模型自主规划、调用工具、操作电脑完成任务", arxivCategories: ["cs.AI", "cs.MA"], keywords: ["agent", "agentic", "tool use", "planning", "computer use"], weight: 1.5 },
  { name: "推理与强化学习", description: "提升模型推理能力的强化学习、思维链与测试时计算", arxivCategories: ["cs.LG", "cs.AI"], keywords: ["reasoning", "reinforcement learning", "RL", "RLHF", "chain-of-thought", "test-time"], weight: 1.5 },
  { name: "多模态", description: "同时理解或生成图像、视频与文字的模型", arxivCategories: ["cs.CV", "cs.CL"], keywords: ["multimodal", "vision-language", "VLM", "video generation", "diffusion", "image generation"], weight: 1.2 },
  { name: "AI 基础设施与效率", description: "让训练和推理更快更省：量化、蒸馏、混合专家与系统优化", arxivCategories: ["cs.LG", "cs.DC"], keywords: ["inference", "efficient", "quantization", "MoE", "mixture of experts", "kernel", "distillation"], weight: 1.0 },
  { name: "对齐与安全", description: "让模型可信、可控、可解释", arxivCategories: ["cs.AI", "cs.CL"], keywords: ["alignment", "safety", "interpretability", "red teaming"], weight: 1.0 },
];

/** 首次启动写入默认主题；旧版本建的默认主题补上描述 */
export function ensureTopics() {
  const rows = db.select().from(schema.topics).all();
  if (!rows.length) {
    db.insert(schema.topics).values(DEFAULT_TOPICS).run();
    return;
  }
  for (const r of rows) {
    const builtin = DEFAULT_TOPICS.find((t) => t.name === r.name);
    if (!r.description && builtin) db.update(schema.topics).set({ description: builtin.description }).where(eq(schema.topics.id, r.id)).run();
  }
}

export function listTopics(): Topic[] {
  return db.select().from(schema.topics).all();
}

export type TopicMatch = { paperId: string; title: string; score: number; digested: boolean };

/** 近期采集到的论文里，命中这个方向最多的几篇（用于主题卡片示例和方向助手试选） */
export function topicMatches(topic: Pick<Topic, "keywords" | "arxivCategories">, opts: { days?: number; limit?: number } = {}): { total: number; top: TopicMatch[] } {
  const since = new Date(Date.now() - (opts.days ?? 30) * 86400_000).toISOString();
  let papers = db.select().from(schema.papers).where(gte(schema.papers.publishedAt, since)).all();
  // 很久没有运行时，退回最近采集的一批
  if (papers.length < 50) papers = db.select().from(schema.papers).orderBy(desc(schema.papers.publishedAt)).limit(300).all();
  const digested = new Set(db.select({ id: schema.digests.paperId }).from(schema.digests).all().map((r) => r.id));
  const scored = papers
    .map((p) => ({ p, score: topicMatchScore(p, topic) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || b.p.upvotes - a.p.upvotes);
  return {
    total: scored.length,
    top: scored.slice(0, opts.limit ?? 5).map(({ p, score }) => ({ paperId: p.id, title: p.title, score, digested: digested.has(p.id) })),
  };
}

const clean = (list: string[]) => [...new Set(list.map((s) => s.trim()).filter(Boolean))];

/** 保存助手给出的主题草稿；同名主题直接更新 */
export function saveTopicDraft(draft: TopicDraft) {
  const values = {
    name: draft.name.trim().slice(0, 40) || "未命名",
    description: draft.description.trim().slice(0, 200),
    arxivCategories: clean(draft.arxivCategories),
    keywords: clean(draft.keywords),
    weight: Math.min(3, Math.max(0.1, Number(draft.weight) || 1)),
  };
  const same = listTopics().find((t) => t.name === values.name);
  if (same) {
    db.update(schema.topics).set(values).where(eq(schema.topics.id, same.id)).run();
    return { id: same.id, updated: true };
  }
  return { id: db.insert(schema.topics).values(values).returning({ id: schema.topics.id }).get().id, updated: false };
}

export type PreferenceSample = { paperId: string; title: string };

/** 读者反馈样例：收藏为感兴趣，不感兴趣（含删除）为不想看；按最近标记排序 */
export function preferenceSamples(limit = 8): { liked: PreferenceSample[]; disliked: PreferenceSample[] } {
  const rows = db
    .select({ paperId: schema.paperMarks.paperId, favorite: schema.paperMarks.favorite, notInterested: schema.paperMarks.notInterested, title: schema.papers.title, titleZh: schema.digests.titleZh })
    .from(schema.paperMarks)
    .innerJoin(schema.papers, eq(schema.papers.id, schema.paperMarks.paperId))
    .leftJoin(schema.digests, eq(schema.digests.paperId, schema.paperMarks.paperId))
    .orderBy(desc(schema.paperMarks.updatedAt))
    .all();
  const pick = (f: (r: (typeof rows)[number]) => boolean) =>
    rows.filter(f).slice(0, limit).map((r) => ({ paperId: r.paperId, title: r.titleZh ? `${r.titleZh}（${r.title}）` : r.title }));
  return { liked: pick((r) => r.favorite), disliked: pick((r) => r.notInterested) };
}
