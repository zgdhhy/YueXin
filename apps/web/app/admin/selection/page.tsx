import { Compass, Pencil, Plus } from "lucide-react";
import { db, schema, getSetting } from "@paper/core";
import { deleteTopic, saveSelection, saveTopic } from "../actions";
import { SubmitButton } from "@/components/admin-client";
import { Card, EditPanel, EmptyState, Field, Input, PageHeader, StatusBadge, Switch, Tag, Textarea, buttonCls } from "@/components/ui";

type Topic = typeof schema.topics.$inferSelect;

function TopicForm({ t }: { t?: Topic }) {
  return (
    <form action={saveTopic} className="space-y-5">
      {t && <input type="hidden" name="id" value={t.id} />}
      <div className="grid gap-4 sm:grid-cols-[1fr_1fr_120px]">
        <Field label="方向名称">
          <Input name="name" defaultValue={t?.name} placeholder="智能体 Agent" required />
        </Field>
        <Field label="arXiv 分类" hint="决定从 arXiv 采集哪些分类">
          <Input name="arxivCategories" defaultValue={t?.arxivCategories.join(", ")} placeholder="cs.AI, cs.CL" />
        </Field>
        <Field label="权重" hint="越高越优先">
          <Input type="number" name="weight" step="0.1" min={0} defaultValue={t?.weight ?? 1} />
        </Field>
      </div>
      <Field label="英文关键词" hint="逗号分隔，按整词匹配标题和摘要">
        <Textarea name="keywords" rows={2} defaultValue={t?.keywords.join(", ")} placeholder="agent, tool use, planning" />
      </Field>
      <div className="flex items-center justify-between border-t border-slate-200 pt-4">
        <Switch name="enabled" label="启用" defaultChecked={t?.enabled ?? true} />
        <SubmitButton pendingText="保存中…">{t ? "保存修改" : "添加方向"}</SubmitButton>
      </div>
    </form>
  );
}

function Section({ title, desc, children }: { title: string; desc: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-4 py-6 first:pt-0 last:pb-0 md:grid-cols-[220px_1fr] md:gap-6">
      <div>
        <h3 className="text-sm font-medium text-slate-900">{title}</h3>
        <p className="mt-1 text-xs leading-relaxed text-slate-500">{desc}</p>
      </div>
      <div>{children}</div>
    </div>
  );
}

export default function SelectionPage() {
  const sel = getSetting("selection");
  const topics = db.select().from(schema.topics).all();
  const maxWeight = Math.max(1, ...topics.map((t) => t.weight));
  return (
    <>
      <PageHeader title="选题与方向" description="决定从哪里找论文、关注哪些方向，以及如何从候选中挑出最值得读的那几篇。" />

      <Card title="关注方向" description="用于初筛打分；大模型精选时也会参考这些方向" padded={false} className="mb-6">
        {topics.length ? (
          <ul className="divide-y divide-slate-100">
            {topics.map((t) => (
              <li key={t.id} className="px-4 py-4 sm:px-6">
                <EditPanel
                  summary={
                    <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
                      <div className="w-40 shrink-0 sm:w-44">
                        <div className={`font-medium ${t.enabled ? "text-slate-900" : "text-slate-400 line-through"}`}>{t.name}</div>
                        <div className="mt-1.5 flex items-center gap-2">
                          <div className="h-1.5 w-20 rounded-full bg-slate-100">
                            <div className="h-full rounded-full bg-indigo-500" style={{ width: `${(t.weight / maxWeight) * 100}%` }} />
                          </div>
                          <span className="text-xs text-slate-500 tabular-nums">×{t.weight}</span>
                        </div>
                      </div>
                      <div className="order-last w-full min-w-0 space-y-1.5 sm:order-none sm:w-auto sm:flex-1">
                        <div className="flex flex-wrap gap-1">
                          {t.arxivCategories.map((c) => (
                            <Tag key={c} tone="indigo">
                              {c}
                            </Tag>
                          ))}
                        </div>
                        <div className="truncate text-xs text-slate-500">{t.keywords.join(" · ")}</div>
                      </div>
                      {!t.enabled && <StatusBadge status="disabled" />}
                      <span className={`${buttonCls("secondary", "sm")} ml-auto`}>
                        <Pencil className="h-3.5 w-3.5" />
                        编辑
                      </span>
                    </div>
                  }
                >
                  <TopicForm t={t} />
                  <form action={deleteTopic} className="mt-3 text-right">
                    <input type="hidden" name="id" value={t.id} />
                    <SubmitButton variant="danger" size="sm" confirm={`确定删除方向「${t.name}」？`}>
                      删除此方向
                    </SubmitButton>
                  </form>
                </EditPanel>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState icon={Compass} title="还没有关注方向" />
        )}
        <div className="border-t border-slate-100 px-4 py-4 sm:px-6">
          <EditPanel
            summary={
              <span className={buttonCls("secondary", "sm")}>
                <Plus className="h-3.5 w-3.5" />
                新增方向
              </span>
            }
          >
            <TopicForm />
          </EditPanel>
        </div>
      </Card>

      <Card title="选题参数">
        <form action={saveSelection}>
          <div className="divide-y divide-slate-100">
            <Section title="论文来源" desc="HF Daily Papers 带社区点赞数；arXiv 按上面方向的分类采集最新提交。">
              <div className="flex flex-wrap gap-x-8 gap-y-4">
                <Switch name="hf" label="HF Daily Papers" defaultChecked={sel.sources.hf} />
                <Switch name="arxiv" label="arXiv 最新" defaultChecked={sel.sources.arxiv} />
              </div>
            </Section>
            <Section title="新论文" desc="每次运行回看多少天内的新论文，以及交给大模型精选的候选数量。">
              <div className="grid gap-4 sm:grid-cols-3">
                <Field label="回看天数">
                  <Input type="number" name="lookbackDays" min={1} max={60} defaultValue={sel.lookbackDays} />
                </Field>
                <Field label="精选候选数">
                  <Input type="number" name="shortlistSize" min={5} max={60} defaultValue={sel.shortlistSize} />
                </Field>
                <Field label="备选篇数" hint="与推荐一同展示">
                  <Input type="number" name="alternates" min={0} max={5} defaultValue={sel.alternates} />
                </Field>
              </div>
            </Section>
            <Section title="近期重要论文" desc="部分名额留给几周到几个月前、已被大量引用的论文（来自 Semantic Scholar）。">
              <div className="grid gap-4 sm:grid-cols-3">
                <Field label="名额比例（%）" hint="每个推荐名额以此概率给近期重要论文">
                  <Input type="number" name="notableRatio" min={0} max={100} defaultValue={Math.round(sel.notableRatio * 100)} />
                </Field>
                <Field label="回看天数">
                  <Input type="number" name="notableLookbackDays" min={14} max={730} defaultValue={sel.notableLookbackDays} />
                </Field>
              </div>
            </Section>
            <Section title="头部机构" desc="论文机构或摘要命中这些名称时，初筛分加分。">
              <Textarea name="institutions" rows={3} defaultValue={sel.institutions.join(", ")} />
            </Section>
          </div>
          <div className="mt-6 flex justify-end border-t border-slate-100 pt-5">
            <SubmitButton pendingText="保存中…">保存参数</SubmitButton>
          </div>
        </form>
      </Card>
    </>
  );
}
