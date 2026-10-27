import Link from "next/link";
import { desc, eq, gte, inArray } from "drizzle-orm";
import { Cron } from "croner";
import { ArrowUpRight, Play, FileBarChart, History, CheckCircle2, AlertCircle } from "lucide-react";
import { configurationIssue, db, schema, getHeartbeat } from "@paper/core";
import { triggerRun, triggerTrendReport } from "./actions";
import { AutoRefresh, SubmitButton, NewRunLink } from "@/components/admin-client";
import { Card, EmptyState, Field, Input, PageHeader, StatusBadge, Textarea, fmtDuration, fmtRelative } from "@/components/ui";

function nextScheduled() {
  return db.select().from(schema.schedules).where(eq(schema.schedules.enabled, true)).all().map(s => {
    try { return { name: s.name, at: new Cron(s.cron, { timezone: s.timezone, paused: true }).nextRun() }; }
    catch { return { name: s.name, at: null }; }
  }).filter((x): x is { name: string; at: Date } => x.at !== null).sort((a,b) => a.at.getTime() - b.at.getTime())[0];
}

export default function AdminHome() {
  const runs = db.select().from(schema.runs).orderBy(desc(schema.runs.id)).limit(20).all();
  const active = db.select().from(schema.runs).where(inArray(schema.runs.status, ["running", "queued"])).orderBy(desc(schema.runs.id)).all();
  const steps = active.length ? db.select().from(schema.runSteps).where(inArray(schema.runSteps.runId, active.map(r => r.id))).orderBy(desc(schema.runSteps.id)).all() : [];
  const digests = db.select({ id: schema.digests.id }).from(schema.digests).where(eq(schema.digests.status, "published")).all();
  const videos = db.select({ id: schema.videos.id }).from(schema.videos).all();
  const recent = db.select({ status: schema.runs.status }).from(schema.runs).where(gte(schema.runs.createdAt, new Date(Date.now() - 30 * 86400_000).toISOString())).all();
  const issue = configurationIssue();
  const beat = getHeartbeat();
  const online = !!beat && Date.now() - beat.getTime() < 90_000;
  const next = nextScheduled();
  const latestFailed = runs[0]?.status === "failed" ? runs[0] : null;
  return <>
    {active.length > 0 && <AutoRefresh />}
    <PageHeader title="任务概览" description="查看正在进行的工作，处理异常，再开始下一篇精读。" actions={<NewRunLink />} />
    <div className="admin-status-line"><span className={online ? "status-online" : "status-offline"}>{online ? "调度服务在线" : "调度服务离线"}</span><span>{next ? `下次运行：${next.at.toLocaleString("zh-CN", {timeZone:"Asia/Shanghai",month:"numeric",day:"numeric",hour:"2-digit",minute:"2-digit",hour12:false})}（北京时间）` : "暂无启用的定时计划"}</span><Link href="/admin/schedules">管理定时计划</Link></div>
    {(issue || !online || latestFailed) && <section className="admin-attention" aria-label="待处理事项"><h2><AlertCircle size={17} />需要留意</h2>{issue && <p><span>{issue}</span><Link href="/admin/models">检查模型配置</Link></p>}{!online && <p><span>调度服务离线，排队中的任务需要服务恢复后执行。</span><span>在项目目录运行 <code>npm run dev:worker</code></span></p>}{latestFailed && <p><span>最近的任务 #{latestFailed.id} 未完成，请查看失败原因。</span><Link href={`/admin/runs/${latestFailed.id}`}>查看任务</Link></p>}</section>}
    <section className="admin-current"><div className="admin-section-heading"><h2>当前任务</h2><span>{active.length ? `${active.length} 个进行中` : "无进行中的任务"}</span></div>{active.length ? <div className="active-run-list">{active.map(r => <Link key={r.id} href={`/admin/runs/${r.id}`}><div><StatusBadge status={r.status} /><strong>#{r.id} {r.kind === "trend_report" ? "趋势月报" : r.params.videoDigestId ? "重新生成视频" : "论文解读"}</strong><span>{steps.find(s => s.runId === r.id)?.name ?? "等待领取任务"}</span></div><ArrowUpRight size={17} /></Link>)}</div> : <div className="admin-idle"><CheckCircle2 size={20} /><div><strong>当前没有进行中的任务</strong><p>{online && !issue ? "自动选题或指定论文，运行后可在这里追踪进度。" : "完成上方待处理事项后，即可开始新的精读任务。"}</p></div></div>}</section>
    <section className="admin-recent"><div className="admin-section-heading"><h2>最近运行</h2><span>最近 {runs.length} 次</span></div>{runs.length ? <div className="admin-table-scroll"><table className="admin-runs-table"><thead><tr><th>任务</th><th>状态</th><th>开始时间</th><th className="hidden sm:table-cell">耗时</th><th className="hidden lg:table-cell">触发方式</th></tr></thead><tbody>{runs.map(r => <tr key={r.id}><td><Link href={`/admin/runs/${r.id}`}><strong>#{r.id}</strong> {r.kind === "trend_report" ? "趋势月报" : r.params.videoDigestId ? "重新生成视频" : "论文解读"}</Link>{r.error && <p className="run-error" title={r.error}>{r.error}</p>}</td><td><StatusBadge status={r.status} /></td><td>{fmtRelative(r.startedAt ?? r.createdAt)}</td><td className="hidden sm:table-cell">{fmtDuration(r.startedAt,r.finishedAt)}</td><td className="hidden lg:table-cell">{r.trigger === "manual" ? "手动" : "定时"}</td></tr>)}</tbody></table></div> : <EmptyState icon={History} title="还没有运行记录">使用下方表单生成第一篇解读。</EmptyState>}</section>
    <details id="new-run" className="admin-run-form" open={runs.length === 0}><summary><Play size={16} />新建解读任务<span>自动选题或指定 arXiv 论文</span></summary><Card title="生成论文解读" description="指定论文后会跳过自动选题。提交后任务进入队列。"><form action={triggerRun} className="space-y-5"><div className="grid gap-5 sm:grid-cols-[140px_minmax(0,1fr)]"><Field label="推荐篇数"><Input type="number" name="picks" defaultValue={1} min={1} max={5} /></Field><Field label="指定论文（可选）" hint="arXiv ID 或链接，多篇用逗号或换行分隔"><Textarea name="paperIds" rows={2} placeholder="例如 2610.22276" /></Field></div><SubmitButton pendingText="提交中…">开始运行</SubmitButton></form></Card></details>
    <details className="admin-run-form"><summary><FileBarChart size={16} />生成趋势月报<span>汇总一个月的研究进展</span></summary><Card title="选择汇总月份"><form action={triggerTrendReport} className="flex flex-wrap items-end gap-5"><Field label="月份" hint="留空则汇总上个月"><Input name="month" type="month" /></Field><SubmitButton variant="secondary" pendingText="提交中…">生成月报</SubmitButton></form></Card></details>
    <div className="admin-totals"><span>内容积累</span><span><strong>{digests.length}</strong> 篇已发布解读</span><span><strong>{videos.length}</strong> 个讲解视频</span><span>近 30 天 <strong>{recent.filter(r => r.status === "succeeded").length}</strong> 次成功运行</span><Link href="/admin/digests">管理内容</Link></div>
  </>;
}
