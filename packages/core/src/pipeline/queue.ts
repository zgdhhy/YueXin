import { asc, eq } from "drizzle-orm";
import { db, schema } from "../db";
import type { RunParams } from "../db/schema";

const now = () => new Date().toISOString();

export function enqueueRun(
  kind: "digest" | "trend_report",
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
