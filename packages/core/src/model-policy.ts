import { createHash, randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "./db";
import { EFFORTS, getSetting, type Stage } from "./settings";

/** 环节键 storyboard 沿用旧名，界面上叫「讲解脚本」 */
export const MODEL_STAGES = ["rerank", "digest", "storyboard", "code", "report", "chat"] as const;
export const STAGE_NAMES: Record<Stage, string> = { rerank: "选题精选", digest: "论文解读", storyboard: "讲解脚本", code: "动画代码", report: "趋势月报", chat: "对话" };
export const stagePolicySchema = z.object({
  modelId: z.number().int().positive().nullable().default(null),
  fallbackMode: z.enum(["inherit", "none", "model"]).default("inherit"),
  fallbackModelId: z.number().int().positive().nullable().default(null),
  outputTokens: z.number().int().min(256).max(2000000).nullable().default(null),
  effort: z.enum(EFFORTS).nullable().default(null),
});
const emptyStage = () => stagePolicySchema.parse({});
const modelPolicySchema = z.object({
  version: z.literal(2).default(2), confirmed: z.boolean().default(false), revision: z.number().int().default(0),
  defaultModelId: z.number().int().positive().nullable().default(null),
  fallbackModelId: z.number().int().positive().nullable().default(null),
  // code、chat 为后加的环节，旧配置里没有时按「沿用默认」补上
  stages: z.object({ rerank: stagePolicySchema, digest: stagePolicySchema, storyboard: stagePolicySchema, code: stagePolicySchema.default(() => emptyStage()), report: stagePolicySchema, chat: stagePolicySchema.default(() => emptyStage()) }),
});
export type ModelPolicy = z.infer<typeof modelPolicySchema>;
export type StagePolicy = z.infer<typeof stagePolicySchema>;
export type StoredProvider = typeof schema.llmProviders.$inferSelect;
export type StoredModel = typeof schema.llmModels.$inferSelect;
export type FrozenTarget = { provider: Omit<StoredProvider, "apiKey" | "oauth">; model: StoredModel };
export type RunModelSnapshot = { version: 2; revision: number; capturedAt: string; stages: Partial<Record<Stage, { primary: FrozenTarget; fallback: FrozenTarget | null }>> };

export function getModelPolicy(): ModelPolicy {
  const value = db.select().from(schema.settings).where(eq(schema.settings.key, "modelPolicy")).get()?.value;
  if (value) return modelPolicySchema.parse(value);
  return modelPolicySchema.parse({ stages: { rerank: emptyStage(), digest: emptyStage(), storyboard: emptyStage(), code: emptyStage(), report: emptyStage(), chat: emptyStage() } });
}
export function saveModelPolicy(value: ModelPolicy) {
  const next = modelPolicySchema.parse({ ...value, revision: Math.max(Date.now(), getModelPolicy().revision + 1) });
  db.insert(schema.settings).values({ key: "modelPolicy", value: next }).onConflictDoUpdate({ target: schema.settings.key, set: { value: next } }).run();
  return next;
}
export function findModelTarget(id: number | null) {
  if (id == null) return null;
  return db.select({ model: schema.llmModels, provider: schema.llmProviders }).from(schema.llmModels)
    .innerJoin(schema.llmProviders, eq(schema.llmProviders.id, schema.llmModels.providerId)).where(eq(schema.llmModels.id, id)).get() ?? null;
}
export function targetIssue(id: number | null): string | null {
  if (id == null) return "尚未选择模型";
  const t = findModelTarget(id);
  if (!t) return "模型或服务商已被删除";
  if (!t.model.enabled) return "模型已停用";
  if (!t.provider.enabled) return "服务商已停用";
  if (t.provider.authType === "oauth" && !t.provider.oauth?.access) return "订阅账号尚未授权";
  return null;
}
export function resolvedStage(stage: Stage, policy = getModelPolicy()) {
  const rule = policy.stages[stage];
  const primaryId = rule.modelId ?? policy.defaultModelId;
  const fallbackId = rule.fallbackMode === "none" ? null : rule.fallbackMode === "model" ? rule.fallbackModelId : policy.fallbackModelId;
  const issues: string[] = [];
  const issue = targetIssue(primaryId); if (issue) issues.push(issue);
  if (rule.fallbackMode === "model" && fallbackId == null) issues.push("尚未选择指定的备用模型");
  if (fallbackId != null) { const problem = targetIssue(fallbackId); if (problem) issues.push(`备用：${problem}`); }
  if (primaryId != null && primaryId === fallbackId) issues.push("主模型和备用模型不能相同");
  return { primaryId, fallbackId, source: rule.modelId == null ? "default" as const : "override" as const, fallbackSource: rule.fallbackMode, issues };
}
export function configurationIssue() {
  const p = getModelPolicy();
  if (!p.confirmed) return "请先在模型配置中确认默认模型与工作流设置";
  const issue = targetIssue(p.defaultModelId);
  return issue ? `默认模型不可用：${issue}` : null;
}
function freezeTarget(id: number, rule: StagePolicy): FrozenTarget {
  const t = findModelTarget(id)!;
  const { apiKey: _, oauth: __, ...provider } = t.provider;
  const { headers: ___, ...options } = provider.options ?? {};
  return { provider: { ...provider, options }, model: { ...t.model, maxOutputTokens: rule.outputTokens ?? t.model.maxOutputTokens, effort: rule.effort ?? t.model.effort } };
}
export function createModelSnapshot(stages: readonly Stage[]): RunModelSnapshot {
  const issue = configurationIssue(); if (issue) throw new Error(issue);
  const policy = getModelPolicy();
  const snapshot: RunModelSnapshot = { version: 2, revision: policy.revision, capturedAt: new Date().toISOString(), stages: {} };
  for (const stage of stages) {
    const resolved = resolvedStage(stage, policy);
    if (resolved.issues.length) throw new Error(`${STAGE_NAMES[stage]}配置异常：${resolved.issues.join("；")}`);
    snapshot.stages[stage] = { primary: freezeTarget(resolved.primaryId!, policy.stages[stage]), fallback: resolved.fallbackId ? freezeTarget(resolved.fallbackId, policy.stages[stage]) : null };
  }
  return snapshot;
}
export function requiredStages(run: { kind: string; params: schema.RunParams }): Stage[] {
  if (run.kind === "trend_report") return ["report"];
  if (run.kind === "trial") return run.params.trial ? [run.params.trial.stage] : [];
  if (run.kind === "sample") return ["code"];
  if (run.kind === "reference") return ["chat", "code"];
  if (run.params.videoDigestId) return run.params.reuseScript ? ["code"] : ["storyboard", "code"];
  return [...(run.params.paperIds?.length ? [] : ["rerank" as const]), "digest", ...(getSetting("video").enabled ? (["storyboard", "code"] as const) : [])];
}
export function modelUsage(ids: number[]) {
  const policy = getModelPolicy(); const usage: string[] = [];
  if (policy.defaultModelId && ids.includes(policy.defaultModelId)) usage.push("默认模型");
  if (policy.fallbackModelId && ids.includes(policy.fallbackModelId)) usage.push("全局备用模型");
  for (const stage of MODEL_STAGES) {
    const r = resolvedStage(stage, policy);
    if (r.primaryId && ids.includes(r.primaryId)) usage.push(STAGE_NAMES[stage]);
    if (r.fallbackId && ids.includes(r.fallbackId)) usage.push(`${STAGE_NAMES[stage]}备用`);
  }
  return [...new Set(usage)];
}
export function assertNotRunning(ids: number[]) {
  const running = db.select().from(schema.runs).where(eq(schema.runs.status, "running")).all();
  for (const run of running) {
    if (run.params.modelSnapshot && Object.values(run.params.modelSnapshot.stages).some((s) => s && (ids.includes(s.primary.model.id) || (s.fallback && ids.includes(s.fallback.model.id))))) throw new Error(`运行 #${run.id} 正在使用该配置，请在运行结束后删除`);
    if (!run.params.modelSnapshot) throw new Error(`运行 #${run.id} 尚未结束，请稍后删除配置`);
  }
}

type Verification = { fingerprint: string; requestId: string; status: "testing" | "passed" | "failed"; checkedAt: string; latencyMs?: number; error?: string };
function fingerprint(id: number) {
  const t = findModelTarget(id); if (!t) return "deleted";
  return createHash("sha256").update(JSON.stringify({ id, model: t.model.modelId, output: t.model.maxOutputTokens, effort: t.model.effort, protocol: t.provider.protocol, base: t.provider.baseUrl, key: t.provider.apiKey, account: t.provider.oauth?.accountId, authorized: !!t.provider.oauth?.access, ...(t.model.upstreamModelId ? { upstream: t.model.upstreamModelId } : {}), ...(t.provider.options && Object.keys(t.provider.options).length ? { options: t.provider.options } : {}) })).digest("hex");
}
function verificationRow(id: number) { return db.select().from(schema.settings).where(eq(schema.settings.key, `modelVerification:${id}`)).get()?.value as Verification | undefined; }
function storeVerification(id: number, value: Verification) { db.insert(schema.settings).values({ key: `modelVerification:${id}`, value }).onConflictDoUpdate({ target: schema.settings.key, set: { value } }).run(); }
export function beginVerification(id: number) {
  const value: Verification = { fingerprint: fingerprint(id), requestId: randomUUID(), status: "testing", checkedAt: new Date().toISOString() };
  storeVerification(id, value); return value;
}
export function finishVerification(id: number, start: Verification, result: { latencyMs: number } | { error: string }) {
  if (verificationRow(id)?.requestId !== start.requestId || fingerprint(id) !== start.fingerprint) return false;
  storeVerification(id, { ...start, checkedAt: new Date().toISOString(), ...result, status: "error" in result ? "failed" : "passed" }); return true;
}
export function modelVerification(id: number) {
  const v = verificationRow(id);
  if (!v) return { status: "untested" as const, checkedAt: null, latencyMs: null, error: null };
  const stale = fingerprint(id) !== v.fingerprint || (v.status === "testing" && Date.now() - Date.parse(v.checkedAt) > 120_000);
  return { status: stale ? "stale" as const : v.status, checkedAt: v.checkedAt, latencyMs: v.latencyMs ?? null, error: stale ? "配置已变化或验证中断，请重新测试" : v.error ?? null };
}
