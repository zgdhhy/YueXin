import { asc, eq } from "drizzle-orm";
import { db, schema } from "../db";
import type { RunParams } from "../db/schema";
import { STAGE_NAMES } from "../model-policy";

const now = () => new Date().toISOString();

export function enqueueRun(
  kind: (typeof schema.runs.$inferInsert)["kind"],
  trigger: "schedule" | "manual",
  params: RunParams = {},
  scheduleId?: number,
) {
  return db
    .insert(schema.runs)
    .values({ kind, trigger, params, scheduleId })
    .returning({ id: schema.runs.id })
    .get().id;
}

/** worker 启动时调用：上次进程中断留下的 running 记为失败 */
export function failInterruptedRuns() {
  db.update(schema.runs)
    .set({ status: "failed", error: "进程中断", finishedAt: now() })
    .where(eq(schema.runs.status, "running"))
    .run();
  db.update(schema.runSteps)
    .set({ status: "failed", finishedAt: now() })
    .where(eq(schema.runSteps.status, "running"))
    .run();
}

export function nextQueuedRun() {
  return db.select().from(schema.runs).where(eq(schema.runs.status, "queued")).orderBy(asc(schema.runs.id)).get();
}

/** 运行在后台列表中的名称 */
export function runLabel(run: { kind: string; params: RunParams }) {
  if (run.kind === "trial" && run.params.trial) return `试写 · ${STAGE_NAMES[run.params.trial.stage]}`;
  if (run.kind === "sample") return "风格样片";
  if (run.kind === "reference") return "参考视频分析";
  if (run.kind === "trend_report") return "趋势月报";
  if (run.params.videoDigestId) return run.params.reuseScript ? "重新生成视频" : "重做视频";
  return "论文解读";
}
