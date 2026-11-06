import { Cron } from "croner";
import { cronToPlan, DEFAULT_PLANS, getSchedulePlanRow, MAX_PICKS, MAX_REPORT_DAY, WEEKDAYS, type DigestPlan, type ReportPlan } from "@paper/core";
import { saveSchedule } from "../actions";
import { SubmitButton } from "@/components/admin/admin-client";
import { Card, Field, Input, PageHeader, Select, Switch } from "@/components/admin/ui";

type Row = NonNullable<ReturnType<typeof getSchedulePlanRow>>;

/** 周一在前 */
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

function nextRun(row: Row | undefined) {
  if (!row?.enabled) return "未启用";
  try {
    const at = new Cron(row.cron, { timezone: row.timezone, paused: true }).nextRun();
    if (!at) return "未启用";
    const fmt = (o: Intl.DateTimeFormatOptions) => at.toLocaleString("zh-CN", { timeZone: row.timezone, ...o });
    return `下次 ${fmt({ month: "long", day: "numeric" })} ${fmt({ weekday: "short" })} ${fmt({ hour: "2-digit", minute: "2-digit", hour12: false })}`;
  } catch {
    return "未启用";
  }
}

/** 已存的 cron 无法用星期/日期表示时，用默认值预填，保存后替换 */
function Replaced() {
  return <p className="text-[13px] text-amber-700">原设置无法在这里显示，保存后将替换。</p>;
}

function Footer({ enabled }: { enabled: boolean }) {
  return (
    <div className="flex items-center justify-between border-t border-slate-100 pt-4">
      <Switch name="enabled" label="启用" defaultChecked={enabled} />
      <SubmitButton pendingText="保存中…">保存</SubmitButton>
    </div>
  );
}

function DigestCard({ row }: { row: Row | undefined }) {
  const parsed = row ? cronToPlan(row) : null;
  const p = (parsed as DigestPlan | null) ?? { ...DEFAULT_PLANS.digest, days: [...DEFAULT_PLANS.digest.days], enabled: row?.enabled ?? true };
  return (
    <Card title="论文精选" extra={<span className="text-[13px] text-slate-500">{nextRun(row)}</span>}>
      <form action={saveSchedule} className="space-y-5">
        <input type="hidden" name="kind" value="digest" />
        <fieldset>
          <legend className="text-[13px] font-medium text-slate-700">星期</legend>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {WEEK_ORDER.map((d) => (
              <label key={d} className="cursor-pointer">
                <input type="checkbox" name="days" value={d} defaultChecked={p.days.includes(d)} className="peer sr-only" />
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-md text-sm text-slate-600 ring-1 ring-slate-300 ring-inset transition peer-checked:bg-indigo-600 peer-checked:text-white peer-checked:ring-indigo-600 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-indigo-600">
                  {WEEKDAYS[d]}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="时间">
            <Input type="time" name="time" defaultValue={p.time} required />
          </Field>
          <Field label="每次推荐">
            <Select name="picks" defaultValue={String(p.picks)}>
              {Array.from({ length: MAX_PICKS }, (_, i) => (
                <option key={i + 1} value={String(i + 1)}>
                  {i + 1} 篇
                </option>
              ))}
            </Select>
          </Field>
        </div>
        {row && !parsed && <Replaced />}
        <Footer enabled={p.enabled} />
      </form>
    </Card>
  );
}

function ReportCard({ row }: { row: Row | undefined }) {
  const parsed = row ? cronToPlan(row) : null;
  const p = (parsed as ReportPlan | null) ?? { ...DEFAULT_PLANS.trend_report, enabled: row?.enabled ?? true };
  return (
    <Card title="趋势月报" extra={<span className="text-[13px] text-slate-500">{nextRun(row)}</span>}>
      <form action={saveSchedule} className="space-y-5">
        <input type="hidden" name="kind" value="trend_report" />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="日期">
            <Select name="day" defaultValue={String(p.day)}>
              {Array.from({ length: MAX_REPORT_DAY }, (_, i) => (
                <option key={i + 1} value={String(i + 1)}>
                  每月 {i + 1} 日
                </option>
              ))}
            </Select>
          </Field>
          <Field label="时间">
            <Input type="time" name="time" defaultValue={p.time} required />
          </Field>
        </div>
        {row && !parsed && <Replaced />}
        <Footer enabled={p.enabled} />
      </form>
    </Card>
  );
}

export default function SchedulesPage() {
  return (
    <>
      <PageHeader title="定时计划" />
      <DigestCard row={getSchedulePlanRow("digest")} />
      <ReportCard row={getSchedulePlanRow("trend_report")} />
    </>
  );
}
