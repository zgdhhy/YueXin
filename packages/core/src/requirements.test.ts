import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "paper-requirements-"));
const { db, schema } = await import("./db");
const { eq } = await import("drizzle-orm");
const req = await import("./requirements");
const policy = await import("./model-policy");
const lib = await import("./library");
const { enqueueRun } = await import("./pipeline/queue");
const { executeRun } = await import("./pipeline/run");

req.ensureRequirementVersions();

const REPORT = "---\ntitle: 测试月报\n---\n## 本月一句话\n内容";
function stream(text: string) {
  return new Response(
    `data: ${JSON.stringify({ choices: [{ delta: { content: text }, finish_reason: null }] })}\n\ndata: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: "stop" }], usage: { prompt_tokens: 2, completion_tokens: 2 } })}\n\ndata: [DONE]\n\n`,
    { headers: { "content-type": "text/event-stream" } },
  );
}
/** 记录每次请求的 system 提示，返回固定的月报 */
function mockLlm(t: { mock: { method: (o: object, k: string, f: unknown) => void } }) {
  const systems: string[] = [];
  t.mock.method(globalThis, "fetch", async (_: unknown, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as { messages: { role: string; content: string }[] };
    systems.push(body.messages.find((m) => m.role === "system")?.content ?? "");
    return stream(REPORT);
  });
  return systems;
}

test("每个环节有内置 v1 并启用；保存新版本不自动启用，重复内容被拒绝", () => {
  for (const stage of req.REQUIREMENT_STAGES) {
    const active = req.activeRequirementVersion(stage);
    assert.equal(active.number, 1);
    assert.equal(active.content, req.BUILTIN_REQUIREMENTS[stage]);
  }
  const v2 = req.saveRequirementVersion("report", "要求 v2", "更短");
  assert.equal(v2.number, 2);
  assert.equal(req.activeRequirementVersion("report").number, 1);
  assert.throws(() => req.saveRequirementVersion("report", " 要求 v2 "), /与 v2 内容相同/);
  req.activateRequirementVersion(v2.id);
  assert.equal(req.activeRequirementVersion("report").id, v2.id);
  assert.equal(req.listRequirementVersions("report").filter((x) => x.active).length, 1);
});

test("运行锁定启用的写作要求，产出记录版本；试写用指定版本且不改动月报", async (t) => {
  const p = db.insert(schema.llmProviders).values({ name: "p", protocol: "openai", apiKey: "k", baseUrl: "https://p.invalid/v1" }).returning().get();
  const m = db.insert(schema.llmModels).values({ providerId: p.id, modelId: "m" }).returning().get();
  policy.saveModelPolicy({ ...policy.getModelPolicy(), confirmed: true, defaultModelId: m.id, fallbackModelId: null });
  db.insert(schema.papers).values({ id: "2609.00001", title: "P", abstract: "", authors: [], publishedAt: "2026-09-01" }).run();
  db.insert(schema.digests).values({ paperId: "2609.00001", runId: 1, titleZh: "解读", oneLiner: "一句话", contentMd: "## 一句话总结\n内容", createdAt: "2026-09-10T00:00:00.000Z" }).run();
  const systems = mockLlm(t);

  const active = req.activeRequirementVersion("report");
  const runId = enqueueRun("trend_report", "manual", { month: "2026-09" });
  await executeRun(runId);
  const run = db.select().from(schema.runs).where(eq(schema.runs.id, runId)).get()!;
  assert.equal(run.status, "succeeded", run.error ?? "");
  assert.equal(run.params.requirements?.report, active.id);
  assert.equal(systems[0], active.content);
  const report = db.select().from(schema.trendReports).where(eq(schema.trendReports.month, "2026-09")).get()!;
  assert.equal(report.requirementsVersionId, active.id);

  const draft = req.saveRequirementVersion("report", "试写用的要求");
  const trialRun = req.enqueueTrial(draft.id, "2026-09");
  assert.equal(req.listTrials(draft.id)[0].output, null);
  await executeRun(trialRun);
  assert.equal(systems[1], "试写用的要求");
  const [trial] = req.listTrials(draft.id);
  assert.deepEqual(trial.output, { title: "测试月报", contentMd: "## 本月一句话\n内容" });
  assert.equal(req.trialBaseline(trial)?.versionId, active.id);
  // 试写不改变启用版本，也不覆盖月报
  assert.equal(req.activeRequirementVersion("report").id, active.id);
  assert.equal(db.select().from(schema.trendReports).all().length, 1);
  assert.throws(() => req.enqueueTrial(req.activeRequirementVersion("rerank").id, "x"), /暂不支持试写/);
});

test("解读修订：补齐旧解读的第一版，切换修订会换正文与标签", () => {
  db.insert(schema.papers).values({ id: "2609.00002", title: "Q", abstract: "", authors: [], publishedAt: "2026-09-01" }).run();
  const d = db.insert(schema.digests).values({ paperId: "2609.00002", runId: 1, titleZh: "旧标题", oneLiner: "旧", contentMd: "旧正文" }).returning().get();
  lib.saveTags(d.id, ["旧标签"]);
  lib.ensureDigestRevisions();
  const [first] = lib.listDigestRevisions(d.id);
  assert.deepEqual([first.titleZh, first.tags], ["旧标题", ["旧标签"]]);
  const second = db.insert(schema.digestRevisions).values({ digestId: d.id, runId: 2, titleZh: "新标题", oneLiner: "新", contentMd: "新正文", tags: ["新标签"] }).returning().get();
  lib.activateDigestRevision(d.id, second.id);
  let row = db.select().from(schema.digests).where(eq(schema.digests.id, d.id)).get()!;
  assert.deepEqual([row.titleZh, row.contentMd, row.revisionId], ["新标题", "新正文", second.id]);
  lib.activateDigestRevision(d.id, first.id);
  row = db.select().from(schema.digests).where(eq(schema.digests.id, d.id)).get()!;
  assert.equal(row.titleZh, "旧标题");
  const tags = db.select({ name: schema.tags.name }).from(schema.digestTags).innerJoin(schema.tags, eq(schema.tags.id, schema.digestTags.tagId)).where(eq(schema.digestTags.digestId, d.id)).all();
  assert.deepEqual(tags.map((x) => x.name), ["旧标签"]);
});

test("内置解读升级先创建待选版本，保留已有内置及自建启用版本", () => {
  const before = req.activeRequirementVersion("digest");
  const next = req.BUILTIN_REQUIREMENTS.digest;
  req.BUILTIN_REQUIREMENTS.digest = `${next}\n- 新的候选规范`;
  try {
    req.ensureRequirementVersions();
    assert.equal(req.activeRequirementVersion("digest").id, before.id);
    assert.equal(req.listRequirementVersions("digest")[0].active, false);
    const custom = req.saveRequirementVersion("digest", "自建要求");
    req.activateRequirementVersion(custom.id);
    req.BUILTIN_REQUIREMENTS.digest += "\n- 又一次升级";
    req.ensureRequirementVersions();
    assert.equal(req.activeRequirementVersion("digest").id, custom.id);
  } finally { req.BUILTIN_REQUIREMENTS.digest = next; req.activateRequirementVersion(before.id); }
});

test("采用解读试写精确复用产出、幂等且可回退，不改要求、视频或旧批注", () => {
  const digest = db.select().from(schema.digests).all().find(d => d.paperId === "2609.00002")!;
  const before = req.activeRequirementVersion("digest");
  const first = lib.listDigestRevisions(digest.id).at(-1)!;
  db.insert(schema.notes).values({ paperId: digest.paperId, section: "旧章节", content: "保留的批注" }).run();
  const version = req.saveRequirementVersion("digest", "试写解读规范");
  const output = { titleZh: "试写标题", oneLiner: "试写导读", tags: ["自由章节"], contentMd: "## 为什么要改\n问题\n## 方法与证据\n机制和结果\n## 能用在哪里\n局限" };
  const trial = db.insert(schema.trials).values({ stage: "digest", versionId: version.id, target: digest.paperId, runId: 99, output }).returning().get();
  assert.equal(req.activeRequirementVersion("digest").id, before.id);
  assert.notEqual(db.select().from(schema.digests).all().find(d => d.id === digest.id)!.titleZh, output.titleZh);
  const videosBefore = db.select().from(schema.videos).all();
  const adopted = req.adoptDigestTrial(trial.id);
  assert.deepEqual([adopted.titleZh, adopted.oneLiner, adopted.tags, adopted.contentMd], [output.titleZh, output.oneLiner, output.tags, output.contentMd]);
  assert.equal(req.adoptDigestTrial(trial.id).id, adopted.id);
  assert.equal(req.activeRequirementVersion("digest").id, before.id);
  assert.deepEqual(db.select().from(schema.videos).all(), videosBefore);
  assert.equal(lib.listNotes(digest.paperId)[0].content, "保留的批注");
  lib.activateDigestRevision(digest.id, first.id);
  assert.equal(db.select().from(schema.digests).all().find(d => d.id === digest.id)!.titleZh, first.titleZh);
  assert.equal(req.adoptDigestTrial(trial.id).id, adopted.id);
  const invalid = db.insert(schema.trials).values({ stage: "digest", versionId: version.id, target: digest.paperId, runId: 100, output: { ...output, contentMd: "没有分节" } }).returning().get();
  assert.throws(() => req.adoptDigestTrial(invalid.id));
});
