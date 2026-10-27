import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "paper-schedule-"));
const { db, schema } = await import("./db");
const plan = await import("./schedule-plan");

test("精选计划与 cron 互转", () => {
  const p = { kind: "digest", enabled: true, days: [4, 1, 1], time: "9:30", picks: 2 } as const;
  const cron = plan.planToCron({ ...p, days: [...p.days] });
  assert.equal(cron, "30 9 * * 1,4");
  assert.deepEqual(plan.cronToPlan({ kind: "digest", cron, enabled: true, picksPerRun: 2 }), {
    kind: "digest",
    enabled: true,
    days: [1, 4],
    time: "09:30",
    picks: 2,
  });
  assert.equal(plan.planToCron({ kind: "digest", enabled: true, days: [0, 1, 2, 3, 4, 5, 6], time: "08:00", picks: 1 }), "0 8 * * *");
  assert.throws(() => plan.planToCron({ kind: "digest", enabled: true, days: [], time: "08:00", picks: 1 }), /至少选择一天/);
  assert.throws(() => plan.planToCron({ kind: "digest", enabled: true, days: [1], time: "25:00", picks: 1 }), /时间格式/);
});

test("旧 cron 写法：区间、周日写作 7、篇数越界", () => {
  const p = plan.cronToPlan({ kind: "digest", cron: "0 8 * * 1-5,7", enabled: false, picksPerRun: 0 });
  assert.deepEqual(p, { kind: "digest", enabled: false, days: [0, 1, 2, 3, 4, 5], time: "08:00", picks: 1 });
  assert.equal(plan.cronToPlan({ kind: "digest", cron: "*/5 * * * *", enabled: true, picksPerRun: 1 }), null);
  assert.equal(plan.cronToPlan({ kind: "digest", cron: "0 8 1 * *", enabled: true, picksPerRun: 1 }), null);
});

test("月报计划与 cron 互转", () => {
  assert.equal(plan.planToCron({ kind: "trend_report", enabled: true, day: 3, time: "07:05" }), "5 7 3 * *");
  assert.deepEqual(plan.cronToPlan({ kind: "trend_report", cron: "5 7 3 * *", enabled: true, picksPerRun: 0 }), {
    kind: "trend_report",
    enabled: true,
    day: 3,
    time: "07:05",
  });
  assert.equal(plan.cronToPlan({ kind: "trend_report", cron: "0 9 31 * *", enabled: true, picksPerRun: 0 }), null);
  assert.throws(() => plan.planToCron({ kind: "trend_report", enabled: true, day: 30, time: "09:00" }), /1–28/);
});

test("每种运行只保留一个定时计划，优先保留已启用的", () => {
  db.insert(schema.schedules)
    .values([
      { name: "旧精选", kind: "digest", cron: "0 8 * * 1", enabled: false },
      { name: "第二个精选", kind: "digest", cron: "0 9 * * 2", enabled: true, picksPerRun: 3 },
    ])
    .run();
  plan.ensureSchedulePlans();
  const rows = db.select().from(schema.schedules).all();
  assert.equal(rows.filter((r) => r.kind === "digest").length, 1);
  assert.equal(plan.getSchedulePlanRow("digest")?.cron, "0 9 * * 2");
  assert.equal(plan.getSchedulePlanRow("trend_report")?.cron, "0 9 1 * *");

  plan.saveSchedulePlan({ kind: "digest", enabled: true, days: [1, 4], time: "09:30", picks: 9 });
  const saved = plan.getSchedulePlanRow("digest")!;
  assert.equal(saved.cron, "30 9 * * 1,4");
  assert.equal(saved.picksPerRun, 5);
  assert.equal(saved.name, "论文精选");
});
