import { and, desc, eq } from "drizzle-orm";
import { db, schema } from "./db";
import { runRequirements } from "./llm";
import { STAGE_NAMES } from "./model-policy";
import { enqueueRun } from "./pipeline/queue";
import { DIGEST_SYSTEM } from "./prompts/digest";
import { RERANK_SYSTEM } from "./prompts/rerank";
import { CODE_SYSTEM } from "./prompts/code";
import { SCRIPT_SYSTEM } from "./prompts/script";
import { TREND_SYSTEM } from "./prompts/trend";
import { z } from "zod";
import { activateDigestRevision, ensureDigestRevisions } from "./library";
/** 有写作要求版本的环节（对话环节的提示词固定在代码里） */
export const REQUIREMENT_STAGES = ["rerank", "digest", "storyboard", "code", "report"] as const;
export type RequirementStage = (typeof REQUIREMENT_STAGES)[number];
type Stage = RequirementStage;

/**
 * 写作要求（ADR 0004）：每个环节交给大模型的可调要求，按版本保存、同时只启用一个。
 * 输出格式不在这里，留在 prompts/ 的代码中，用户改不坏解析。
 */
export type RequirementVersion = typeof schema.requirementVersions.$inferSelect;

/** 内置的写作要求（代码更新后会成为新的内置版本） */
export const BUILTIN_REQUIREMENTS: Record<Stage, string> = {
  rerank: RERANK_SYSTEM,
  digest: DIGEST_SYSTEM,
  storyboard: SCRIPT_SYSTEM,
  code: CODE_SYSTEM,
  report: TREND_SYSTEM,
};

/** 支持试写的环节；选题精选试写需要重新采集候选，暂不支持 */
export const TRIAL_STAGES: readonly Stage[] = ["digest", "storyboard", "report"];

const v = schema.requirementVersions;

export function listRequirementVersions(stage: Stage): RequirementVersion[] {
  return db.select().from(v).where(eq(v.stage, stage)).orderBy(desc(v.number)).all();
}

export function getRequirementVersion(id: number): RequirementVersion | undefined {
  return db.select().from(v).where(eq(v.id, id)).get();
}

const BUILTIN_NOTE = "内置";

/**
 * 每个环节都有当前的内置版本，且恰好一个版本启用。
 * 内置更新后追加版本。解读升级保持既有启用版本，待试写后主动启用；
 * 其他环节的旧内置自动更新，用户自己保存的启用版本不受影响。
 */
export function ensureRequirementVersions() {
  for (const stage of REQUIREMENT_STAGES) {
    const list = listRequirementVersions(stage);
    const builtin = BUILTIN_REQUIREMENTS[stage].trim();
    if (!list.some((x) => x.content.trim() === builtin)) {
      const activeIsBuiltin = !list.length || (stage !== "digest" && list.some((x) => x.active && x.note === BUILTIN_NOTE));
      db.transaction((tx) => {
        if (activeIsBuiltin) tx.update(v).set({ active: false }).where(eq(v.stage, stage)).run();
        tx.insert(v).values({ stage, number: (list[0]?.number ?? 0) + 1, content: builtin, note: BUILTIN_NOTE, active: activeIsBuiltin }).run();
      });
      continue;
    }
    if (!list.some((x) => x.active)) db.update(v).set({ active: true }).where(eq(v.id, list[0].id)).run();
  }
}

export function activeRequirementVersion(stage: Stage): RequirementVersion {
  const active = db.select().from(v).where(and(eq(v.stage, stage), eq(v.active, true))).get();
  if (active) return active;
  ensureRequirementVersions();
  return db.select().from(v).where(and(eq(v.stage, stage), eq(v.active, true))).get()!;
}

/** 保存为新版本（不自动启用）；与已有版本内容相同时拒绝 */
export function saveRequirementVersion(stage: Stage, content: string, note = ""): RequirementVersion {
  const text = content.trim();
  if (!text) throw new Error("写作要求不能为空");
  const list = listRequirementVersions(stage);
  const same = list.find((x) => x.content.trim() === text);
  if (same) throw new Error(`与 v${same.number} 内容相同`);
  return db
    .insert(v)
    .values({ stage, number: (list[0]?.number ?? 0) + 1, content: text, note: note.trim().slice(0, 200) })
    .returning()
    .get();
}

/** 启用某个版本；进行中的运行仍按认领时锁定的版本执行 */
export function activateRequirementVersion(id: number) {
  const target = getRequirementVersion(id);
  if (!target) throw new Error("版本不存在");
  db.transaction((tx) => {
    tx.update(v).set({ active: false }).where(eq(v.stage, target.stage)).run();
    tx.update(v).set({ active: true }).where(eq(v.id, id)).run();
  });
  return target;
}

/** 运行认领时锁定所需环节的启用版本 */
export function snapshotRequirements(stages: readonly string[]): Partial<Record<Stage, number>> {
  const own = stages.filter((s): s is Stage => (REQUIREMENT_STAGES as readonly string[]).includes(s));
  return Object.fromEntries(own.map((s) => [s, activeRequirementVersion(s).id]));
}

/** 环节当前应使用的写作要求：运行中取锁定的版本，否则取启用版本 */
export function requirementsFor(stage: Stage): RequirementVersion {
  const id = runRequirements()?.[stage];
  const locked = id != null ? getRequirementVersion(id) : undefined;
  if (id != null && !locked) throw new Error(`${STAGE_NAMES[stage]}的写作要求版本 #${id} 不存在`);
  return locked ?? activeRequirementVersion(stage);
}

/** 版本的简短名称，如「论文解读 v3」 */
export function versionLabel(id: number | null | undefined) {
  if (id == null) return null;
  const x = getRequirementVersion(id);
  return x ? `${STAGE_NAMES[x.stage]} v${x.number}` : null;
}

// ---------- 试写 ----------

export type Trial = typeof schema.trials.$inferSelect;
export type TrialWithRun = Trial | { id: null; runId: number; stage: Stage; versionId: number; target: string; output: null; createdAt: string; status: "queued" | "running" | "failed"; error: string | null };

/** 排一次试写；对象：论文解读为 arXiv id，讲解脚本为解读 id，趋势月报为月份 */
export function enqueueTrial(versionId: number, target: string) {
  const version = getRequirementVersion(versionId);
  if (!version) throw new Error("版本不存在");
  if (!TRIAL_STAGES.includes(version.stage)) throw new Error(`${STAGE_NAMES[version.stage]}暂不支持试写`);
  const ok =
    version.stage === "digest"
      ? !!db.select({ id: schema.digests.id }).from(schema.digests).where(eq(schema.digests.paperId, target)).get()
      : version.stage === "storyboard"
        ? !!db.select({ id: schema.digests.id }).from(schema.digests).where(eq(schema.digests.id, Number(target))).get()
        : /^\d{4}-\d{2}$/.test(target);
  if (!ok) throw new Error("试写对象不存在");
  return enqueueRun("trial", "manual", { trial: { stage: version.stage, versionId, target } });
}

/** 某个版本的试写：已完成的带产出，未完成的带运行状态 */
export function listTrials(versionId: number): TrialWithRun[] {
  const done = db.select().from(schema.trials).where(eq(schema.trials.versionId, versionId)).all();
  const doneRuns = new Set(done.map((t) => t.runId));
  const pending = db
    .select()
    .from(schema.runs)
    .where(eq(schema.runs.kind, "trial"))
    .all()
    .filter((r) => r.params.trial?.versionId === versionId && !doneRuns.has(r.id) && r.status !== "succeeded")
    .map((r) => ({ id: null, runId: r.id, stage: r.params.trial!.stage, versionId, target: r.params.trial!.target, output: null, createdAt: r.createdAt, status: r.status as "queued" | "running" | "failed", error: r.error }));
  return [...pending, ...done].sort((a, b) => b.runId - a.runId);
}

export function getTrial(id: number): Trial | undefined {
  return db.select().from(schema.trials).where(eq(schema.trials.id, id)).get();
}

const digestTrialOutput = z.object({ titleZh: z.string().trim().min(1), oneLiner: z.string().trim().min(1), contentMd: z.string().min(1).refine(s => /^##\s+\S/m.test(s), "解读正文缺少分节"), tags: z.array(z.string()) });

/** 精确采用已完成的解读试写；不再次调用模型，不更改启用要求或视频。 */
export function adoptDigestTrial(id: number) {
  const trial = getTrial(id);
  if (!trial || trial.stage !== "digest") throw new Error("解读试写不存在");
  const version = getRequirementVersion(trial.versionId);
  if (!version || version.stage !== "digest") throw new Error("写作要求版本不存在");
  const output = digestTrialOutput.parse(trial.output);
  const digest = db.select().from(schema.digests).where(eq(schema.digests.paperId, trial.target)).get();
  if (!digest) throw new Error("解读不存在");
  return db.transaction(tx => {
    ensureDigestRevisions(digest.id);
    const old = tx.select().from(schema.digestRevisions).where(and(eq(schema.digestRevisions.digestId, digest.id), eq(schema.digestRevisions.runId, trial.runId), eq(schema.digestRevisions.requirementsVersionId, trial.versionId))).all().find(r => r.titleZh === output.titleZh && r.oneLiner === output.oneLiner && r.contentMd === output.contentMd && JSON.stringify(r.tags) === JSON.stringify(output.tags));
    const revision = old ?? tx.insert(schema.digestRevisions).values({ digestId: digest.id, runId: trial.runId, requirementsVersionId: trial.versionId, ...output }).returning().get();
    activateDigestRevision(digest.id, revision.id);
    return revision;
  });
}

/** 试写对象当前对读者生效的产出，用于并排对比 */
export function trialBaseline(t: Pick<Trial, "stage" | "target">): { output: unknown; versionId: number | null } | null {
  if (t.stage === "digest") {
    const d = db.select().from(schema.digests).where(eq(schema.digests.paperId, t.target)).get();
    if (!d) return null;
    const rev = d.revisionId ? db.select().from(schema.digestRevisions).where(eq(schema.digestRevisions.id, d.revisionId)).get() : undefined;
    return { output: { titleZh: d.titleZh, oneLiner: d.oneLiner, tags: rev?.tags ?? [], contentMd: d.contentMd }, versionId: rev?.requirementsVersionId ?? null };
  }
  if (t.stage === "storyboard") {
    const s = db.select().from(schema.explainerScripts).where(eq(schema.explainerScripts.digestId, Number(t.target))).get();
    return s ? { output: { title: s.title, styleId: s.styleId, styleReason: s.styleReason, shots: s.shots }, versionId: s.requirementsVersionId } : null;
  }
  if (t.stage === "report") {
    const r = db.select().from(schema.trendReports).where(eq(schema.trendReports.month, t.target)).get();
    return r ? { output: { title: r.title, contentMd: r.contentMd }, versionId: r.requirementsVersionId } : null;
  }
  return null;
}
