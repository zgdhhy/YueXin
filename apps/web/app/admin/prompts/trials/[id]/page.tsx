import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema, getRequirementVersion, getTrial, trialBaseline, versionLabel, STAGE_NAMES } from "@paper/core";
import { requireAuth } from "@/lib/auth";
import { activateRequirement, adoptTrial } from "../../../actions";
import { SubmitButton } from "@/components/admin/admin-client";
import { PageHeader, StatusBadge } from "@/components/admin/ui";
import { OutputView, SideBySide } from "../../../output-views";

/** 试写结果与当前对读者生效的产出并排对比 */
export default async function TrialPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAuth();
  const trial = getTrial(Number((await params).id));
  if (!trial) notFound();
  const version = getRequirementVersion(trial.versionId);
  if (!version) notFound();
  const baseline = trialBaseline(trial);
  const paperId =
    trial.stage === "digest" ? trial.target : trial.stage === "storyboard" ? db.select().from(schema.digests).where(eq(schema.digests.id, Number(trial.target))).get()?.paperId : undefined;
  const figures = paperId ? db.select().from(schema.figures).where(eq(schema.figures.paperId, paperId)).all() : [];
  const back = `/admin/prompts?stage=${trial.stage}&v=${version.id}`;
  return (
    <>
      <Link href={back} className="admin-back">返回 {STAGE_NAMES[trial.stage]} v{version.number}</Link>
      <PageHeader
        title="试写对比"
        actions={
          <div className="flex flex-wrap items-center gap-3">
          {trial.stage === "digest" && <form action={adoptTrial}><input type="hidden" name="id" value={trial.id} /><SubmitButton confirm="采用这次试写作为当前解读？旧修订保留，已有视频不会更新，也不会启用未来写作要求。">采用这次解读</SubmitButton></form>}
          {version.active ? (
            <StatusBadge status="enabled" />
          ) : (
            <form action={activateRequirement}>
              <input type="hidden" name="id" value={version.id} />
              <input type="hidden" name="back" value={`/admin/prompts/trials/${trial.id}`} />
              <SubmitButton confirm={`启用 v${version.number}？之后开始的运行都会使用它，当前文章不变。`}>启用此写作要求</SubmitButton>
            </form>
          )}</div>
        }
      />
      {trial.stage === "digest" && <p className="mb-6 text-sm text-slate-500">采用试写只更新这篇文章，旧修订可恢复，已有讲解视频不会随之更新。启用写作要求只影响未来生成。</p>}
      <SideBySide
        left={{
          label: <>当前 · {versionLabel(baseline?.versionId) ?? "版本未记录"}</>,
          body: baseline ? <OutputView stage={trial.stage} output={baseline.output} figures={figures} /> : <p className="text-sm text-slate-500">还没有当前产出。</p>,
        }}
        right={{ label: <>试写 · {STAGE_NAMES[trial.stage]} v{version.number}</>, body: <OutputView stage={trial.stage} output={trial.output} figures={figures} /> }}
      />
    </>
  );
}
