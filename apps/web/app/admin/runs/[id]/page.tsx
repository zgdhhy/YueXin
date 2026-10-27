import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { ArrowLeft, CheckCircle2, CircleDashed, ExternalLink, Loader2, MinusCircle, XCircle } from "lucide-react";
import { db, schema } from "@paper/core";
import { AutoRefresh } from "@/components/admin-client";
import { Card, StatusBadge, Tag, fmtDuration, fmtTime } from "@/components/ui";

const STEP_ICON = {
  running: <Loader2 className="h-5 w-5 animate-spin text-sky-500" />,
  succeeded: <CheckCircle2 className="h-5 w-5 text-emerald-500" />,
  failed: <XCircle className="h-5 w-5 text-red-500" />,
  skipped: <MinusCircle className="h-5 w-5 text-slate-400" />,
};

export default async function RunPage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  const run = db.select().from(schema.runs).where(eq(schema.runs.id, id)).get();
  if (!run) notFound();
  const steps = db.select().from(schema.runSteps).where(eq(schema.runSteps.runId, id)).orderBy(asc(schema.runSteps.id)).all();
  const candidates = db
    .select({ c: schema.candidates, title: schema.papers.title, upvotes: schema.papers.upvotes, citations: schema.papers.citations })
    .from(schema.candidates)
    .innerJoin(schema.papers, eq(schema.papers.id, schema.candidates.paperId))
    .where(eq(schema.candidates.runId, id))
    .all()
    .sort((a, b) => (a.c.role ? 0 : 1) - (b.c.role ? 0 : 1) || b.c.ruleScore - a.c.ruleScore);
  const calls = db.select().from(schema.llmCalls).where(eq(schema.llmCalls.runId, id)).all();
  const cost = calls.some((c) => c.costUsd != null) ? calls.reduce((a, c) => a + (c.costUsd ?? 0), 0) : null;
  const active = run.status === "queued" || run.status === "running";
  const kind = run.kind === "digest" ? (run.params.videoDigestId ? "重做视频" : "论文解读") : "趋势月报";

  return (
    <>
      {active && <AutoRefresh />}
      <Link href="/admin" className="mb-4 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900">
        <ArrowLeft className="h-4 w-4" />
        返回概览
      </Link>
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">
          运行 #{run.id} · {kind}
        </h1>
        <StatusBadge status={run.status} />
      </div>
      <dl className="mb-6 grid grid-cols-2 gap-4 rounded-2xl bg-white p-4 sm:p-5 text-sm shadow-sm ring-1 ring-slate-200/80 sm:grid-cols-4">
        {[
          ["触发方式", run.trigger === "schedule" ? "定时" : "手动"],
          ["开始时间", fmtTime(run.startedAt)],
          ["结束时间", fmtTime(run.finishedAt)],
          ["耗时", fmtDuration(run.startedAt, run.finishedAt)],
        ].map(([k, v]) => (
          <div key={k}>
            <dt className="text-xs text-slate-500">{k}</dt>
            <dd className="mt-1 font-medium text-slate-900">{v}</dd>
          </div>
        ))}
      </dl>

      {calls.length > 0 && (
        <p className="-mt-3 mb-6 flex flex-wrap gap-x-4 gap-y-1 px-1 text-xs text-slate-500 tabular-nums">
          <span>大模型调用 {calls.length} 次</span>
          <span>输入 {calls.reduce((a, c) => a + c.inputTokens, 0).toLocaleString()} tokens</span>
          <span>输出 {calls.reduce((a, c) => a + c.outputTokens, 0).toLocaleString()} tokens</span>
          {cost != null && <span>估算费用 ${cost.toFixed(2)}</span>}
          {calls.some((c) => c.status === "error") && (
            <span className="text-red-600">失败 {calls.filter((c) => c.status === "error").length} 次</span>
          )}
          {calls.some((c) => c.isFallback) && (
            <span className="text-amber-600">使用备用模型 {calls.filter((c) => c.isFallback).length} 次</span>
          )}
        </p>
      )}

      {run.status === "queued" && (
        <div className="mb-6 flex items-center gap-2 rounded-xl bg-slate-100 px-4 py-3 text-sm text-slate-600">
          <CircleDashed className="h-4 w-4 animate-spin" />
          等待 worker 领取…如果长时间不动，请确认 worker 在线（见左下角）。
        </div>
      )}
      {run.error && <div className="mb-6 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">{run.error}</div>}

      <Card title="执行步骤" className="mb-6">
        {steps.length ? (
          <ol className="relative space-y-5">
            {steps.map((s, i) => (
              <li key={s.id} className="relative flex gap-4">
                {i < steps.length - 1 && <span className="absolute top-7 bottom-[-20px] left-[9.5px] w-px bg-slate-200" />}
                <div className="relative z-10 bg-white">{STEP_ICON[s.status]}</div>
                <div className="min-w-0 flex-1">
                  <details open={s.status !== "succeeded"} className="group">
                    <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1 [&::-webkit-details-marker]:hidden">
                      <span className="font-medium text-slate-900">{s.name}</span>
                      {s.paperId && <Tag>{s.paperId}</Tag>}
                      <span className="text-xs text-slate-400">{fmtDuration(s.startedAt, s.finishedAt)}</span>
                      <span className="ml-auto hidden text-xs text-slate-400 group-open:hidden sm:inline">展开日志</span>
                      {s.status === "succeeded" && s.paperId && s.name === "解读" && (
                        <Link href={`/papers/${s.paperId}`} className="inline-flex items-center gap-1 text-xs text-indigo-600 hover:underline">
                          查看解读 <ExternalLink className="h-3 w-3" />
                        </Link>
                      )}
                    </summary>
                    <pre className="mt-3 max-h-80 overflow-auto rounded-lg bg-slate-950 p-3 sm:p-4 font-mono text-xs leading-relaxed whitespace-pre-wrap text-slate-300">
                      {s.log || "…"}
                    </pre>
                  </details>
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-sm text-slate-500">尚未开始</p>
        )}
      </Card>

      {candidates.length > 0 && (
        <Card title={`候选论文 · ${candidates.length} 篇`} description="规则初筛后交给大模型精选的候选，按结果和初筛分排序" padded={false}>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs text-slate-500">
                <th className="hidden px-6 py-3 font-medium sm:table-cell">初筛分</th>
                <th className="px-4 py-3 font-medium sm:px-3">论文</th>
                <th className="hidden px-3 py-3 font-medium md:table-cell">热度</th>
                <th className="px-4 py-3 text-right font-medium sm:px-6">结果</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {candidates.map(({ c, title, upvotes, citations }) => (
                <tr key={c.id} className={c.role === "pick" ? "bg-indigo-50/60" : ""}>
                  <td className="hidden px-6 py-3 font-mono text-xs text-slate-500 tabular-nums sm:table-cell">{c.ruleScore.toFixed(1)}</td>
                  <td className="px-4 py-3 sm:px-3">
                    <a href={`https://arxiv.org/abs/${c.paperId}`} target="_blank" className="text-slate-900 hover:text-indigo-700">
                      {title}
                    </a>
                    {c.reason && <p className="mt-1 text-xs leading-relaxed text-slate-500">{c.reason}</p>}
                  </td>
                  <td className="hidden px-3 py-3 text-xs whitespace-nowrap text-slate-500 md:table-cell">
                    {c.notable ? `引用 ${citations ?? 0}` : `👍 ${upvotes}`}
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap sm:px-6">
                    {c.role === "pick" ? <Tag tone="indigo">推荐</Tag> : c.role === "alternate" ? <Tag tone="amber">备选</Tag> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </>
  );
}
