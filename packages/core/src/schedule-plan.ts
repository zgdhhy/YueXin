import { asc, eq } from "drizzle-orm";
import { db, schema } from "./db";

/**
 * 定时计划：后台只展示「星期几 / 每月几号 + 时间」，cron 只在内部使用。
 * 每种运行只有一个定时计划（论文精选、趋势月报）。
 */
export type DigestPlan = { kind: "digest"; enabled: boolean; days: number[]; time: string; picks: number };
export type ReportPlan = { kind: "trend_report"; enabled: boolean; day: number; time: string };
export type SchedulePlan = DigestPlan | ReportPlan;
export type ScheduleKind = SchedulePlan["kind"];

const SCHEDULE_KINDS = ["digest", "trend_report"] as const;
const PLAN_NAMES: Record<ScheduleKind, string> = { digest: "论文精选", trend_report: "趋势月报" };
export const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];
/** 月报日期上限：避开没有 29–31 号的月份 */
export const MAX_REPORT_DAY = 28;
export const MAX_PICKS = 5;

export const DEFAULT_PLANS = {
  digest: { kind: "digest", enabled: true, days: [1], time: "08:00", picks: 1 },
  trend_report: { kind: "trend_report", enabled: true, day: 1, time: "09:00" },
} as const satisfies { digest: DigestPlan; trend_report: ReportPlan };

const TIME = /^([01]?\d|2[0-3]):([0-5]\d)$/;

function parseTime(time: string) {
  const m = TIME.exec(time.trim());
  if (!m) throw new Error(`时间格式无效：${time}`);
  return { h: Number(m[1]), m: Number(m[2]) };
}

const pad = (n: number) => String(n).padStart(2, "0");

export function planToCron(p: SchedulePlan): string {
  const { h, m } = parseTime(p.time);
  if (p.kind === "digest") {
    const days = [...new Set(p.days)].sort((a, b) => a - b);
    if (!days.length || days.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) throw new Error("请至少选择一天");
    return `${m} ${h} * * ${days.length === 7 ? "*" : days.join(",")}`;
  }
  if (!Number.isInteger(p.day) || p.day < 1 || p.day > MAX_REPORT_DAY) throw new Error(`日期需在 1–${MAX_REPORT_DAY} 号之间`);
  return `${m} ${h} ${p.day} * *`;
}

/** 解析星期字段：支持 *、单值、逗号列表与区间（7 视为周日） */
function parseDays(field: string): number[] | null {
  if (field === "*") return [0, 1, 2, 3, 4, 5, 6];
  const days = new Set<number>();
  for (const part of field.split(",")) {
    const r = /^(\d)(?:-(\d))?$/.exec(part);
    if (!r) return null;
    const from = Number(r[1]);
    const to = r[2] === undefined ? from : Number(r[2]);
    if (from > 7 || to > 7 || from > to) return null;
    for (let d = from; d <= to; d++) days.add(d % 7);
  }
  return [...days].sort((a, b) => a - b);
}

/** cron 能用星期/日期 + 时间表示时返回计划，否则返回 null（如每小时、指定月份） */
export function cronToPlan(row: { kind: ScheduleKind; cron: string; enabled: boolean; picksPerRun: number }): SchedulePlan | null {
  const f = row.cron.trim().split(/\s+/);
  if (f.length !== 5 || !/^\d+$/.test(f[0]) || !/^\d+$/.test(f[1]) || f[3] !== "*") return null;
  const m = Number(f[0]);
  const h = Number(f[1]);
  if (m > 59 || h > 23) return null;
  const time = `${pad(h)}:${pad(m)}`;
  if (row.kind === "digest") {
    const days = f[2] === "*" ? parseDays(f[4]) : null;
    if (!days) return null;
    return { kind: "digest", enabled: row.enabled, days, time, picks: clampPicks(row.picksPerRun) };
  }
  if (!/^\d+$/.test(f[2]) || f[4] !== "*") return null;
  const day = Number(f[2]);
  if (day < 1 || day > MAX_REPORT_DAY) return null;
  return { kind: "trend_report", enabled: row.enabled, day, time };
}

const clampPicks = (n: number) => Math.min(MAX_PICKS, Math.max(1, Math.round(n) || 1));

type ScheduleRow = typeof schema.schedules.$inferSelect;

/** 每种运行保留一条定时计划：优先保留已启用的那条，删除其余 */
export function ensureSchedulePlans() {
  const rows = db.select().from(schema.schedules).orderBy(asc(schema.schedules.id)).all();
  for (const kind of SCHEDULE_KINDS) {
    const same = rows.filter((r) => r.kind === kind);
    if (!same.length) {
      const p = DEFAULT_PLANS[kind];
      db.insert(schema.schedules)
        .values({ name: PLAN_NAMES[kind], kind, cron: planToCron(p), enabled: p.enabled, picksPerRun: kind === "digest" ? DEFAULT_PLANS.digest.picks : 0 })
        .run();
      continue;
    }
    const keep = same.find((r) => r.enabled) ?? same[0];
    for (const r of same) {
      if (r.id !== keep.id) db.delete(schema.schedules).where(eq(schema.schedules.id, r.id)).run();
    }
  }
}

export function getSchedulePlanRow(kind: ScheduleKind): ScheduleRow | undefined {
  return db.select().from(schema.schedules).orderBy(asc(schema.schedules.id)).all().find((r) => r.kind === kind);
}

/** 保存某种运行的定时计划；worker 30 秒内同步 */
export function saveSchedulePlan(p: SchedulePlan) {
  const values = {
    name: PLAN_NAMES[p.kind],
    cron: planToCron(p),
    enabled: p.enabled,
    picksPerRun: p.kind === "digest" ? clampPicks(p.picks) : 0,
  };
  const row = getSchedulePlanRow(p.kind);
  if (row) db.update(schema.schedules).set(values).where(eq(schema.schedules.id, row.id)).run();
  else db.insert(schema.schedules).values({ ...values, kind: p.kind }).run();
}
