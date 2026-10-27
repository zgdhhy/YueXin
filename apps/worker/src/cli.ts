// 命令行手动执行一次：
//   npm run run-once -w @paper/worker                 按当前配置选题
//   npm run run-once -w @paper/worker -- 2610.22276   直接解读指定论文
//   npm run run-once -w @paper/worker -- --video 3    只重做解读 #3 的视频
//   npm run run-once -w @paper/worker -- --report 2026-10  生成指定月份的趋势月报
import { enqueueRun, seedDefaults, db, schema, configurationIssue } from "@paper/core";
import { executeRun } from "@paper/core/run";
import { eq } from "drizzle-orm";

seedDefaults();
const issue = configurationIssue();
if (issue) { console.error(issue); process.exit(1); }
const args = process.argv.slice(2);
const id =
  args[0] === "--video"
    ? enqueueRun("digest", "manual", { videoDigestId: Number(args[1]) })
    : args[0] === "--report"
      ? enqueueRun("trend_report", "manual", { month: args[1] })
      : enqueueRun("digest", "manual", args.length ? { paperIds: args } : { picks: 1 });
await executeRun(id);
const run = db.select().from(schema.runs).where(eq(schema.runs.id, id)).get()!;
console.log(`run#${id} ${run.status}${run.error ? `：${run.error}` : ""}`);
process.exit(run.status === "succeeded" ? 0 : 1);
