import { and, eq } from "drizzle-orm";
import { db, schema } from "../db";
import { generateDigest, writeDigest } from "./digest";
import { selectPapers, type Log } from "./select";
import { generateScript, makeStyleSample, renderVideo, writeScript, writeShotCodes } from "./video";
import { styleFromReference } from "./reference";
import { getScript } from "../script";
import { getSetting } from "../settings";
import { broadcast, digestNotice, failureNotice, type Notice } from "./notify";
import { runLabel } from "./queue";
import { defaultMonth, generateReport, reportNotice, writeTrendReport } from "./trend";
import { withRunContext } from "../llm";
import { createModelSnapshot, requiredStages } from "../model-policy";
import { snapshotRequirements } from "../requirements";

const now = () => new Date().toISOString();

/** 记录一个步骤：日志实时写库，便于后台查看进度 */
async function step<T>(runId: number, name: string, paperId: string | null, fn: (log: Log) => Promise<T>): Promise<T> {
  const row = db
    .insert(schema.runSteps)
    .values({ runId, name, paperId, status: "running" })
    .returning({ id: schema.runSteps.id })
    .get();
  let buf = "";
  const log: Log = (s) => {
    const line = `[${new Date().toLocaleTimeString("zh-CN", { hour12: false })}] ${s}`;
    console.log(`run#${runId} ${name}: ${s}`);
    buf += line + "\n";
    db.update(schema.runSteps).set({ log: buf }).where(eq(schema.runSteps.id, row.id)).run();
  };
  try {
    const result = await fn(log);
    db.update(schema.runSteps).set({ status: "succeeded", finishedAt: now() }).where(eq(schema.runSteps.id, row.id)).run();
    return result;
  } catch (e) {
    log(`失败：${e instanceof Error ? e.stack ?? e.message : String(e)}`);
    db.update(schema.runSteps).set({ status: "failed", finishedAt: now() }).where(eq(schema.runSteps.id, row.id)).run();
    throw e;
  }
}

/** 讲解脚本 → 动画代码 → 渲染；失败只记录在步骤里，不影响解读发布 */
async function makeVideo(run: typeof schema.runs.$inferSelect, digestId: number, paperId: string) {
  try {
    // 沿用脚本时只重写改过的镜头；还没有脚本时照常先写脚本
    if (!run.params.reuseScript || !getScript(digestId)) {
      await step(run.id, "讲解脚本", paperId, (log) => writeScript(digestId, log, { styleId: run.params.styleId }));
    }
    await step(run.id, "动画代码", paperId, (log) => writeShotCodes(digestId, log));
    await step(run.id, "渲染视频", paperId, (log) => renderVideo(digestId, log));
  } catch {
    // 已在步骤日志中记录
  }
}

async function runDigest(run: typeof schema.runs.$inferSelect) {
  const videoEnabled = getSetting("video").enabled;

  // 仅重做视频
  if (run.params.videoDigestId) {
    const d = db.select().from(schema.digests).where(eq(schema.digests.id, run.params.videoDigestId)).get();
    if (!d) throw new Error("解读不存在");
    await makeVideo(run, d.id, d.paperId);
    if (!db.select().from(schema.videos).where(eq(schema.videos.digestId, d.id)).get()) throw new Error("视频生成失败");
    return;
  }

  const picks = run.params.picks ?? 1;
  const selection = await step(run.id, "选题", null, (log) =>
    selectPapers(run.id, picks, log, run.params.paperIds),
  );
  const done: number[] = [];
  for (const pick of selection.picks) {
    let digestId: number;
    try {
      digestId = await step(run.id, "解读", pick.paperId, (log) => writeDigest(run.id, pick, log));
    } catch {
      continue;
    }
    done.push(digestId);
    if (videoEnabled) await makeVideo(run, digestId, pick.paperId);
  }
  if (!done.length) throw new Error("所有推荐的解读都失败了");
  await notifySafely(run.id, "digest", () => digestNotice(done));
}

async function runTrendReport(run: typeof schema.runs.$inferSelect) {
  const month = run.params.month || defaultMonth();
  const report = await step(run.id, "趋势月报", null, (log) => writeTrendReport(month, log));
  if (report) await notifySafely(run.id, "report", () => reportNotice(report));
}

/** 试写：用指定的写作要求版本生成一次产出，只存进 trials，不影响读者看到的内容 */
async function runTrial(run: typeof schema.runs.$inferSelect) {
  const t = run.params.trial;
  if (!t) throw new Error("缺少试写参数");
  const output = await step(run.id, "试写", t.stage === "digest" ? t.target : null, async (log) => {
    if (t.stage === "digest") {
      const d = db.select().from(schema.digests).where(eq(schema.digests.paperId, t.target)).get();
      return (await generateDigest({ paperId: t.target, reason: d?.pickReason ?? "手动指定" }, log)).parsed;
    }
    if (t.stage === "storyboard") return (await generateScript(Number(t.target), log)).script;
    if (t.stage === "report") {
      const r = await generateReport(t.target, log);
      if (!r) throw new Error(`${t.target} 没有解读，无法试写月报`);
      return r.parsed;
    }
    throw new Error(`该环节暂不支持试写`);
  });
  db.insert(schema.trials).values({ runId: run.id, stage: t.stage, versionId: t.versionId, target: t.target, output }).run();
}

/** 为视频风格渲染样片 */
async function runSample(run: typeof schema.runs.$inferSelect) {
  const styleId = run.params.styleId;
  if (styleId == null) throw new Error("缺少风格");
  await step(run.id, "风格样片", null, (log) => makeStyleSample(styleId, log));
}

/** 分析参考视频，生成停用中的新风格与样片 */
async function runReference(run: typeof schema.runs.$inferSelect) {
  const ref = run.params.referencePath;
  if (!ref) throw new Error("缺少参考视频");
  await step(run.id, "参考视频分析", null, (log) => styleFromReference(ref, log));
}

/** 通知失败不影响运行结果 */
async function notifySafely(runId: number, event: Parameters<typeof broadcast>[0], notice: () => Notice) {
  try {
    await step(runId, "通知", null, (log) => broadcast(event, notice(), log));
  } catch {
    // 已在步骤日志中记录
  }
}

export async function executeRun(runId: number) {
  const run = db.select().from(schema.runs).where(eq(schema.runs.id, runId)).get();
  if (!run) throw new Error(`run ${runId} 不存在`);
  if (run.status !== "queued") return true;
  let snapshot: ReturnType<typeof createModelSnapshot>;
  let requirements: ReturnType<typeof snapshotRequirements>;
  try {
    const claimed = db.transaction(() => {
      const stages = requiredStages(run);
      const frozen = createModelSnapshot(stages);
      // 写作要求与模型一起锁定；试写用指定的版本
      const requirements = { ...snapshotRequirements(stages), ...(run.params.trial ? { [run.params.trial.stage]: run.params.trial.versionId } : {}) };
      const result = db.update(schema.runs).set({ status: "running", error: null, startedAt: now(), params: { ...run.params, modelSnapshot: frozen, requirements } })
        .where(and(eq(schema.runs.id, runId), eq(schema.runs.status, "queued"))).run();
      return result.changes ? { frozen, requirements } : null;
    });
    if (!claimed) return true;
    snapshot = claimed.frozen;
    requirements = claimed.requirements;
  } catch (e) {
    db.update(schema.runs).set({ error: e instanceof Error ? e.message : String(e) }).where(and(eq(schema.runs.id, runId), eq(schema.runs.status, "queued"))).run();
    return false;
  }
  try {
    // 运行上下文让大模型调用记录关联到本次 run
    const body = { trial: runTrial, sample: runSample, reference: runReference, trend_report: runTrendReport, digest: runDigest }[run.kind];
    await withRunContext(runId, () => body(run), snapshot, requirements);
    db.update(schema.runs).set({ status: "succeeded", finishedAt: now() }).where(eq(schema.runs.id, runId)).run();
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    db.update(schema.runs).set({ status: "failed", error, finishedAt: now() }).where(eq(schema.runs.id, runId)).run();
    // 试写、样片与参考视频分析失败只在后台显示，不发告警
    if (run.kind === "digest" || run.kind === "trend_report") await notifySafely(runId, "failure", () => failureNotice({ id: runId, label: runLabel(run), error }));
  }
  return true;
}
