import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "paper-policy-"));
const { db, schema } = await import("./db");
const { eq } = await import("drizzle-orm");
const policy = await import("./model-policy");
const { llmForStage, withRunContext } = await import("./llm");
const { executeRun } = await import("./pipeline/run");

const p = db.insert(schema.llmProviders).values({ name: "primary", protocol: "openai", apiKey: "SECRET-PRIMARY", baseUrl: "https://primary.invalid/v1" }).returning().get();
const backup = db.insert(schema.llmProviders).values({ name: "backup", protocol: "openai", apiKey: "SECRET-BACKUP", baseUrl: "https://backup.invalid/v1" }).returning().get();
const m = db.insert(schema.llmModels).values({ providerId: p.id, modelId: "primary-model", maxOutputTokens: 32000 }).returning().get();
const b = db.insert(schema.llmModels).values({ providerId: backup.id, modelId: "backup-model" }).returning().get();
const reset = () => {
  db.update(schema.llmProviders).set({ enabled: true, apiKey: "SECRET-PRIMARY", baseUrl: "https://primary.invalid/v1" }).where(eq(schema.llmProviders.id, p.id)).run();
  db.update(schema.llmModels).set({ enabled: true, maxOutputTokens: 32000 }).where(eq(schema.llmModels.id, m.id)).run();
  const next = policy.getModelPolicy();
  for (const stage of policy.MODEL_STAGES) next.stages[stage] = policy.stagePolicySchema.parse({});
  return policy.saveModelPolicy({ ...next, confirmed: true, defaultModelId: m.id, fallbackModelId: null });
};

test("升级不推断默认；旧配置保留，未确认运行保持 queued", async () => {
  assert.equal(policy.getModelPolicy().confirmed, false);
  assert.equal(policy.getModelPolicy().defaultModelId, null);
  assert.throws(() => policy.createModelSnapshot(["digest"]), /确认默认模型/);
  const run = db.insert(schema.runs).values({ kind: "digest", trigger: "manual", params: { videoDigestId: 99999 } }).returning().get();
  assert.equal(await executeRun(run.id), false);
  assert.equal(db.select().from(schema.runs).where(eq(schema.runs.id, run.id)).get()?.status, "queued");
  assert.equal(db.select().from(schema.llmProviders).all().length, 2);
});

test("四环节继承、月报独立覆盖、显式关闭备用", () => {
  const next = reset(); next.fallbackModelId = b.id;
  next.stages.report.modelId = b.id;
  next.stages.report.fallbackMode = "none";
  next.stages.digest.fallbackMode = "none";
  policy.saveModelPolicy(next);
  assert.equal(policy.resolvedStage("rerank").fallbackId, b.id);
  assert.equal(policy.resolvedStage("digest").fallbackId, null);
  assert.equal(policy.resolvedStage("report").primaryId, b.id);
  assert.equal(policy.resolvedStage("report").fallbackId, null);
  assert.equal(policy.resolvedStage("report").source, "override");
});

test("失效模型报错，不选择数据库中其他启用项", () => {
  reset();
  db.update(schema.llmModels).set({ enabled: false }).where(eq(schema.llmModels.id, m.id)).run();
  assert.match(policy.configurationIssue()!, /已停用/);
  assert.throws(() => policy.createModelSnapshot(["digest"]), /默认模型不可用/);
  assert.equal(policy.resolvedStage("digest").primaryId, m.id);
});

test("快照固定模型、参数和地址，不保存凭据；请求仍读取轮换后的 Key", async (t) => {
  const next = reset(); next.stages.digest.outputTokens = 4096; policy.saveModelPolicy(next);
  const snapshot = policy.createModelSnapshot(["digest"]);
  assert.ok(!JSON.stringify(snapshot).includes("SECRET"));
  policy.saveModelPolicy({ ...policy.getModelPolicy(), defaultModelId: b.id });
  db.update(schema.llmModels).set({ enabled: false, maxOutputTokens: 12345 }).where(eq(schema.llmModels.id, m.id)).run();
  db.update(schema.llmProviders).set({ enabled: false, apiKey: "SECRET-ROTATED", baseUrl: "https://changed.invalid/v1" }).where(eq(schema.llmProviders.id, p.id)).run();
  const calls: { url: string; auth: string | null; body: Record<string, unknown> }[] = [];
  t.mock.method(globalThis, "fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), auth: new Headers(init?.headers).get("authorization"), body: JSON.parse(String(init?.body)) });
    return stream("snapshot-ok");
  });
  const result = await withRunContext(123, () => llmForStage("digest").generate({ system: "test", prompt: "test" }), snapshot);
  assert.equal(result, "snapshot-ok");
  assert.match(calls[0].url, /primary\.invalid/);
  assert.equal(calls[0].body.model, "primary-model");
  assert.equal(calls[0].body.max_tokens, 4096);
  assert.equal(calls[0].auth, "Bearer SECRET-ROTATED");
});

test("仅在明确配置时调用备用，不扩展为其他可用模型", async (t) => {
  const next = reset(); next.fallbackModelId = b.id; policy.saveModelPolicy(next);
  const snapshot = policy.createModelSnapshot(["digest"]);
  const called: string[] = [];
  t.mock.method(globalThis, "fetch", async (input: RequestInfo | URL) => {
    called.push(String(input));
    return String(input).includes("primary.invalid") ? Response.json({ error: { message: "primary rejected" } }, { status: 400 }) : stream("fallback-ok");
  });
  assert.equal(await withRunContext(124, () => llmForStage("digest").generate({ system: "test", prompt: "test" }), snapshot), "fallback-ok");
  assert.equal(called.length, 2);
  const noFallback = reset(); noFallback.stages.digest.fallbackMode = "none"; policy.saveModelPolicy(noFallback);
  await assert.rejects(withRunContext(125, () => llmForStage("digest").generate({ system: "test", prompt: "test" }), policy.createModelSnapshot(["digest"])), /primary rejected/);
  assert.equal(called.length, 3);
});

test("验证状态持久化，修改配置后过期，迟到结果不能覆盖", () => {
  reset();
  assert.equal(policy.modelVerification(m.id).status, "untested");
  const first = policy.beginVerification(m.id);
  const second = policy.beginVerification(m.id);
  assert.equal(policy.finishVerification(m.id, first, { error: "late" }), false);
  assert.equal(policy.finishVerification(m.id, second, { latencyMs: 50 }), true);
  assert.equal(policy.modelVerification(m.id).status, "passed");
  db.update(schema.llmProviders).set({ apiKey: "SECRET-CHANGED" }).where(eq(schema.llmProviders.id, p.id)).run();
  assert.equal(policy.modelVerification(m.id).status, "stale");
  assert.equal(policy.finishVerification(m.id, second, { latencyMs: 1 }), false);
});

test("运行认领时保存快照；正在使用的配置不能删除", async () => {
  reset();
  const run = db.insert(schema.runs).values({ kind: "digest", trigger: "manual", params: { videoDigestId: 999999 } }).returning().get();
  await executeRun(run.id); // 缺少对应解读，在网络调用前失败，仍可核查快照。
  const saved = db.select().from(schema.runs).where(eq(schema.runs.id, run.id)).get()!;
  assert.ok(saved.params.modelSnapshot?.stages.storyboard);
  assert.ok(!JSON.stringify(saved.params.modelSnapshot).includes("SECRET"));
  db.update(schema.runs).set({ status: "running" }).where(eq(schema.runs.id, run.id)).run();
  assert.throws(() => policy.assertNotRunning([m.id]), /正在使用/);
  db.update(schema.runs).set({ status: "failed" }).where(eq(schema.runs.id, run.id)).run();
  assert.doesNotThrow(() => policy.assertNotRunning([m.id]));
});

function stream(text: string) {
  return new Response(`data: ${JSON.stringify({ choices: [{ delta: { content: text }, finish_reason: null }] })}\n\ndata: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: "stop" }], usage: { prompt_tokens: 2, completion_tokens: 2 } })}\n\ndata: [DONE]\n\n`, { headers: { "content-type": "text/event-stream" } });
}
