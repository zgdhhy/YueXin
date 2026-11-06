import Link from "next/link";
import { desc } from "drizzle-orm";
import {
  db,
  schema,
  listRequirementVersions,
  activeRequirementVersion,
  getRequirementVersion,
  listTrials,
  REQUIREMENT_STAGES,
  promptConversation,
  STAGE_NAMES,
  TRIAL_STAGES,
  type RequirementStage as Stage,
} from "@paper/core";
import { activateRequirement, saveRequirement, startTrial } from "../actions";
import { PromptAssistant } from "./prompt-assistant";
import { SubmitButton } from "@/components/admin/admin-client";
import { Card, Field, Input, PageHeader, Select, StatusBadge, Textarea, fmtRelative } from "@/components/admin/ui";
import { cn } from "@/lib/cn";

type Params = Record<string, string | string[] | undefined>;

/** 试写对象：论文解读按论文、讲解脚本按解读、趋势月报按月份 */
function trialTargets(stage: Stage): { value: string; label: string }[] {
  const digests = db.select({ id: schema.digests.id, paperId: schema.digests.paperId, titleZh: schema.digests.titleZh, createdAt: schema.digests.createdAt }).from(schema.digests).orderBy(desc(schema.digests.createdAt)).limit(50).all();
  if (stage === "digest") return digests.map((d) => ({ value: d.paperId, label: d.titleZh }));
  if (stage === "storyboard") return digests.map((d) => ({ value: String(d.id), label: d.titleZh }));
  return [...new Set(digests.map((d) => d.createdAt.slice(0, 7)))].map((m) => ({ value: m, label: m.replace("-", " 年 ") + " 月" }));
}

export default async function PromptsPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const stage = (REQUIREMENT_STAGES as readonly string[]).includes(String(params.stage)) ? (params.stage as Stage) : "digest";
  const versions = listRequirementVersions(stage);
  const active = activeRequirementVersion(stage);
  const picked = Number(params.v) ? getRequirementVersion(Number(params.v)) : undefined;
  const current = picked?.stage === stage ? picked : active;
  const canTrial = TRIAL_STAGES.includes(stage);
  const targets = canTrial ? trialTargets(stage) : [];
  const trials = canTrial ? listTrials(current.id) : [];
  const chat = promptConversation(stage);
  const targetLabel = (t: string) => targets.find((x) => x.value === t)?.label ?? t;
  return (
    <>
      <PageHeader
        title="提示词"
        actions={
          <PromptAssistant
            key={stage}
            stage={stage}
            stageName={STAGE_NAMES[stage]}
            versionId={current.id}
            versionNumber={current.number}
            versions={Object.fromEntries(versions.map((v) => [v.id, { number: v.number, content: v.content }]))}
            conversationId={chat?.id ?? null}
            initial={chat?.messages ?? []}
          />
        }
      />
      <nav className="admin-tabs" aria-label="环节">
        {REQUIREMENT_STAGES.map((s) => (
          <Link key={s} href={`/admin/prompts?stage=${s}`} aria-current={s === stage ? "page" : undefined}>{STAGE_NAMES[s]}</Link>
        ))}
      </nav>
      <div className="prompt-layout">
        <Card padded={false} className="prompt-versions">
          <ul>
            {versions.map((v) => (
              <li key={v.id}>
                <Link href={`/admin/prompts?stage=${stage}&v=${v.id}`} aria-current={v.id === current.id ? "true" : undefined} className={cn(v.id === current.id && "is-current")}>
                  <span className="flex items-center gap-2">
                    <strong>v{v.number}</strong>
                    {v.active && <StatusBadge status="enabled" />}
                    <span className="ml-auto text-xs text-slate-400">{fmtRelative(v.createdAt)}</span>
                  </span>
                  {v.note && <span className="block truncate text-[13px] text-slate-500">{v.note}</span>}
                </Link>
              </li>
            ))}
          </ul>
        </Card>
        <div className="min-w-0 space-y-6">
          <Card
            title={`写作要求 v${current.number}`}
            extra={
              current.active ? (
                <StatusBadge status="enabled" />
              ) : (
                <form action={activateRequirement}>
                  <input type="hidden" name="id" value={current.id} />
                  <SubmitButton size="sm" confirm={`启用 v${current.number}？之后开始的运行都会使用它，进行中的运行不受影响。`}>启用</SubmitButton>
                </form>
              )
            }
          >
            <form action={saveRequirement} className="space-y-4">
              <input type="hidden" name="stage" value={stage} />
              <input type="hidden" name="from" value={current.id} />
              <Textarea key={current.id} name="content" defaultValue={current.content} rows={16} aria-label="写作要求" className="leading-relaxed" />
              <div className="flex flex-wrap items-end gap-3">
                <Field label="改动说明" className="min-w-0 flex-1">
                  <Input name="note" placeholder="可选，例如：更口语化、加强实验部分" maxLength={200} />
                </Field>
                <SubmitButton variant="secondary" pendingText="保存中…">保存为新版本</SubmitButton>
              </div>
            </form>
          </Card>
          {canTrial && (
            <Card title={`试写 v${current.number}`}>
              {targets.length ? (
                <form action={startTrial} className="flex flex-wrap items-end gap-3">
                  <input type="hidden" name="id" value={current.id} />
                  <Field label={stage === "report" ? "月份" : "论文"} className="min-w-0 flex-1">
                    <Select name="target">
                      {targets.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </Select>
                  </Field>
                  <SubmitButton variant="secondary" pendingText="提交中…">开始试写</SubmitButton>
                </form>
              ) : (
                <p className="text-sm text-slate-500">还没有可试写的解读。</p>
              )}
              {trials.length > 0 && (
                <ul className="mt-5 divide-y divide-slate-100 border-t border-slate-100">
                  {trials.map((t) => (
                    <li key={t.runId} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-3 text-sm">
                      <span className="min-w-0 flex-1 truncate">{targetLabel(t.target)}</span>
                      <span className="text-xs text-slate-400">{fmtRelative(t.createdAt)}</span>
                      {t.id != null ? (
                        <Link href={`/admin/prompts/trials/${t.id}`} className="font-medium text-indigo-600">对比</Link>
                      ) : (
                        <Link href={`/admin/runs/${t.runId}`}><StatusBadge status={t.status} /></Link>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}
          {!canTrial && <p className="text-[13px] text-slate-500">{STAGE_NAMES[stage]}暂不支持试写。</p>}
        </div>
      </div>
    </>
  );
}
