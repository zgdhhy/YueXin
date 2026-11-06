import { Compass, Plus } from "lucide-react";
import { getSetting, listTopics, topicConversation, topicMatches, withMatches, type Topic } from "@paper/core";
import { deleteTopic, saveSelection, saveTopic } from "../actions";
import { SubmitButton } from "@/components/admin/admin-client";
import { Card, EmptyState, Field, Input, PageHeader, StatusBadge, Switch, Textarea } from "@/components/admin/ui";
import { RatioField, TopicAssistant } from "./topic-assistant";

/** 方向的完整设置：通常由方向助手生成，这里供手动微调 */
function TopicForm({ t }: { t?: Topic }) {
  return (
    <form action={saveTopic} className="space-y-4">
      {t && <input type="hidden" name="id" value={t.id} />}
      <div className="grid gap-4 sm:grid-cols-[1fr_120px]">
        <Field label="名称">
          <Input name="name" defaultValue={t?.name} required />
        </Field>
        <Field label="权重">
          <Input type="number" name="weight" step="0.1" min={0} defaultValue={t?.weight ?? 1} />
        </Field>
      </div>
      <Field label="想看什么样的论文">
        <Input name="description" defaultValue={t?.description} maxLength={200} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="arXiv 分类">
          <Input name="arxivCategories" defaultValue={t?.arxivCategories.join(", ")} placeholder="cs.AI, cs.CL" />
        </Field>
        <Field label="英文关键词">
          <Input name="keywords" defaultValue={t?.keywords.join(", ")} placeholder="agent, tool use" />
        </Field>
      </div>
      <div className="flex items-center justify-between gap-3 border-t border-slate-200 pt-4">
        <Switch name="enabled" label="启用" defaultChecked={t?.enabled ?? true} />
        <SubmitButton size="sm" pendingText="保存中…">{t ? "保存" : "添加"}</SubmitButton>
      </div>
    </form>
  );
}

export default function SelectionPage() {
  const sel = getSetting("selection");
  const topics = listTopics();
  const chat = topicConversation();
  return (
    <>
      <PageHeader
        title="选题与方向"
        actions={<TopicAssistant conversationId={chat?.id ?? null} initial={(chat?.messages ?? []).map(withMatches)} topicNames={topics.map((t) => t.name)} />}
      />

      <Card title="关注方向" padded={false} className="mb-6">
        {topics.length ? (
          <ul className="divide-y divide-slate-100">
            {topics.map((t) => {
              const hits = topicMatches(t, { limit: 3 });
              return (
                <li key={t.id} className="px-4 py-4 sm:px-6">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`font-medium ${t.enabled ? "text-slate-900" : "text-slate-400"}`}>{t.name}</span>
                    {!t.enabled && <StatusBadge status="disabled" />}
                  </div>
                  <p className="mt-1 text-sm text-slate-600">{t.description || <span className="text-slate-400">未写描述</span>}</p>
                  {hits.total > 0 && (
                    <p className="mt-1.5 line-clamp-1 text-[13px] text-slate-500" title={hits.top.map((h) => h.title).join("\n")}>
                      近期命中 {hits.total} 篇：{hits.top.map((h) => h.title).join("；")}
                    </p>
                  )}
                  <details className="topic-advanced">
                    <summary>高级</summary>
                    <TopicForm t={t} />
                    <form action={deleteTopic} className="mt-3 text-right">
                      <input type="hidden" name="id" value={t.id} />
                      <SubmitButton variant="danger" size="sm" confirm={`删除方向「${t.name}」？`}>删除</SubmitButton>
                    </form>
                  </details>
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyState icon={Compass} title="还没有关注方向">点右上角「方向助手」，用一句话描述你的兴趣</EmptyState>
        )}
        <details className="topic-advanced border-t border-slate-100 px-4 py-3 sm:px-6">
          <summary><Plus className="h-3.5 w-3.5" />手动添加</summary>
          <TopicForm />
        </details>
      </Card>

      <Card title="选题参数">
        <form action={saveSelection} className="space-y-6">
          <div className="flex flex-wrap gap-x-8 gap-y-4">
            <Switch name="hf" label="HF 每日热门论文" defaultChecked={sel.sources.hf} />
            <Switch name="arxiv" label="arXiv 最新论文" defaultChecked={sel.sources.arxiv} />
          </div>
          <RatioField defaultValue={Math.round(sel.notableRatio * 100)} />
          <details className="topic-advanced">
            <summary>高级</summary>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="新论文往前看几天">
                <Input type="number" name="lookbackDays" min={1} max={60} defaultValue={sel.lookbackDays} />
              </Field>
              <Field label="近期重要论文往前看几天">
                <Input type="number" name="notableLookbackDays" min={14} max={730} defaultValue={sel.notableLookbackDays} />
              </Field>
              <Field label="交给大模型挑选的候选篇数">
                <Input type="number" name="shortlistSize" min={5} max={60} defaultValue={sel.shortlistSize} />
              </Field>
              <Field label="每次附带的备选篇数">
                <Input type="number" name="alternates" min={0} max={5} defaultValue={sel.alternates} />
              </Field>
              <Field label="知名机构（论文来自这些机构时优先）" className="sm:col-span-2">
                <Textarea name="institutions" rows={3} defaultValue={sel.institutions.join(", ")} />
              </Field>
            </div>
          </details>
          <div className="flex justify-end border-t border-slate-100 pt-5">
            <SubmitButton pendingText="保存中…">保存</SubmitButton>
          </div>
        </form>
      </Card>
    </>
  );
}
