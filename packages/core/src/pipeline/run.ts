import { and, eq } from "drizzle-orm";
import { db, schema } from "../db";
import { writeDigest } from "./digest";
import { selectPapers, type Log } from "./select";
import { renderVideo, writeStoryboard } from "./video";
import { getSetting } from "../settings";
import { broadcast, digestNotice, failureNotice, type Notice } from "./notify";
import { defaultMonth, reportNotice, writeTrendReport } from "./trend";
import { withRunContext } from "../llm";
import { createModelSnapshot, requiredStages } from "../model-policy";

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

/** 分镜 + 渲染；失败只记录在步骤里，不影响解读发布 */
async function makeVideo(runId: number, digestId: number, paperId: string) {
  try {
    const storyboard = await step(runId, "分镜", paperId, (log) => writeStoryboard(digestId, log));
    await step(runId, "渲染视频", paperId, (log) => renderVideo(digestId, storyboard, log));
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
    await makeVideo(run.id, d.id, d.paperId);
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
    if (videoEnabled) await makeVideo(run.id, digestId, pick.paperId);
  }
  if (!done.length) throw new Error("所有推荐的解读都失败了");
  await notifySafely(run.id, "digest", () => digestNotice(done));
}

async function runTrendReport(run: typeof schema.runs.$inferSelect) {
  const month = run.params.month || defaultMonth();
  const report = await step(run.id, "趋势月报", null, (log) => writeTrendReport(month, log));
  if (report) await notifySafely(run.id, "report", () => reportNotice(report));
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
  try {
    const claimed = db.transaction(() => {
      const frozen = createModelSnapshot(requiredStages(run));
      const result = db.update(schema.runs).set({ status: "running", error: null, startedAt: now(), params: { ...run.params, modelSnapshot: frozen } })
        .where(and(eq(schema.runs.id, runId), eq(schema.runs.status, "queued"))).run();
      return result.changes ? frozen : null;
    });
    if (!claimed) return true;
    snapshot = claimed;
  } catch (e) {
    db.update(schema.runs).set({ error: e instanceof Error ? e.message : String(e) }).where(and(eq(schema.runs.id, runId), eq(schema.runs.status, "queued"))).run();
    return false;
  }
  try {
    // 运行上下文让大模型调用记录关联到本次 run
    await withRunContext(runId, () => (run.kind === "digest" ? runDigest(run) : runTrendReport(run)), snapshot);
    db.update(schema.runs).set({ status: "succeeded", finishedAt: now() }).where(eq(schema.runs.id, runId)).run();
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    db.update(schema.runs).set({ status: "failed", error, finishedAt: now() }).where(eq(schema.runs.id, runId)).run();
    await notifySafely(runId, "failure", () => failureNotice({ id: runId, kind: run.kind, error }));
  }
  return true;
}
