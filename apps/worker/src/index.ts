import { Cron } from "croner";
import { db, schema, enqueueRun, failInterruptedRuns, nextQueuedRun, seedDefaults, touchHeartbeat, configurationIssue, broadcast, skippedNotice } from "@paper/core";
import { executeRun } from "@paper/core/run";

seedDefaults();
failInterruptedRuns();

/** schedule id → 正在运行的定时器及其配置指纹 */
const jobs = new Map<number, { job: Cron; key: string }>();

/** 与数据库中的定时计划对齐：后台改动在 30 秒内生效，无需重启 */
function syncSchedules() {
  const rows = db.select().from(schema.schedules).all();
  const seen = new Set<number>();
  for (const s of rows) {
    if (!s.enabled) continue;
    seen.add(s.id);
    const key = `${s.cron}|${s.timezone}|${s.kind}|${s.picksPerRun}`;
    if (jobs.get(s.id)?.key === key) continue;
    jobs.get(s.id)?.job.stop();
    try {
      const job = new Cron(s.cron, { timezone: s.timezone }, () => {
        const issue = configurationIssue();
        if (issue) {
          console.warn(`[scheduler] 暂停模型运行：${issue}`);
          broadcast("failure", skippedNotice(s.name, issue), (m) => console.log(`[notify] ${m}`)).catch((e) => console.error("[notify]", e));
          return;
        }
        const id = enqueueRun(s.kind, "schedule", { picks: s.picksPerRun }, s.id);
        console.log(`[scheduler] 「${s.name}」触发 run#${id}`);
      });
      jobs.set(s.id, { job, key });
      console.log(`[scheduler] 「${s.name}」${s.cron} (${s.timezone})，下次：${job.nextRun()?.toLocaleString("zh-CN")}`);
    } catch (e) {
      console.error(`[scheduler] 「${s.name}」cron 无效：${s.cron}`, e);
    }
  }
  for (const [id, { job }] of jobs) {
    if (!seen.has(id)) {
      job.stop();
      jobs.delete(id);
    }
  }
}

let busy = false;
/** 任务串行执行：视频渲染和大模型调用都很吃资源 */
async function drainQueue() {
  if (busy) return;
  busy = true;
  try {
    for (let run = nextQueuedRun(); run; run = nextQueuedRun()) {
      console.log(`[worker] 开始 run#${run.id}（${run.kind}）`);
      if (await executeRun(run.id) === false) break;
      console.log(`[worker] 结束 run#${run.id}`);
    }
  } finally {
    busy = false;
  }
}

syncSchedules();
touchHeartbeat();
setInterval(() => {
  syncSchedules();
  touchHeartbeat();
}, 30_000);
setInterval(() => void drainQueue(), 5_000);
void drainQueue();
console.log("[worker] 已启动");
