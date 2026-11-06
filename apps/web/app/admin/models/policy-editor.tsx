"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronRight, Search } from "lucide-react";
import type { WorkspaceData, WorkspaceModel } from "@/lib/model-workspace";
import type { Stage } from "@paper/core";
import { supportsEffort as modelSupportsEffort } from "@paper/core/connection";
import { Dropdown } from "@/components/admin/dropdown";
import { LlmIconImg } from "@/components/admin/llm-icon-img";
import { Action, Dialog, FormField, SearchInput, TextInput, type Act } from "./workspace-ui";

const names: Record<Stage, string> = { rerank: "选题精选", digest: "论文解读", storyboard: "讲解脚本", code: "动画代码", report: "趋势月报", chat: "对话" };
function ModelLabel({ id, data }: { id: number | null; data: WorkspaceData }) {
  const m = data.models.find((x) => x.id === id); const p = data.providers.find((x) => x.id === m?.providerId);
  return <span className="mw-model-label min-w-0"><span className="block break-words font-medium text-slate-800">{m ? m.displayName || m.modelId : id ? "原模型已被删除" : "尚未选择"}</span>{m && <span className="mt-1 block break-all text-[13px] text-slate-500">{p?.name ?? "服务商已被删除"}{m.displayName ? ` · ${m.modelId}` : ""}</span>}</span>;
}
export function verificationLabel(m: WorkspaceModel) {
  return !m.enabled ? "已停用" : ({ untested: "尚未验证", stale: "验证已过期", testing: "验证中", passed: "验证通过", failed: "验证失败" }[m.verification.status]);
}
export function PolicyEditor({ data, stage, initialModelId, act, onClose }: {
  data: WorkspaceData; stage?: Stage; initialModelId?: number; act: Act; onClose: () => void;
}) {
  const policy = stage ? data.policy.stages[stage] : null;
  const initial = () => ({
    primaryId: initialModelId ?? (policy ? policy.modelId : data.policy.defaultModelId),
    primaryMode: policy && !policy.modelId ? "inherit" : "model",
    fallbackId: policy ? policy.fallbackModelId : data.policy.fallbackModelId,
    fallbackMode: policy ? policy.fallbackMode : data.policy.fallbackModelId ? "model" : "none",
    outputTokens: policy?.outputTokens?.toString() ?? "", effort: policy?.effort ?? "",
    revision: data.policy.revision, search: "", field: null as "primary" | "fallback" | null,
    saving: false, error: "",
  });
  const [d, setForm] = useState(initial);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const reset = () => setForm(initial());
  const patch = (next: Partial<typeof d>) => setForm(current => ({ ...current, ...next }));
  const primaryId = stage && d.primaryMode === "inherit" ? data.policy.defaultModelId : d.primaryId;
  const primary = data.models.find((m) => m.id === primaryId);
  const provider = data.providers.find((p) => p.id === primary?.providerId);
  const supportsEffort = provider && primary && modelSupportsEffort(provider,primary);
  const available = data.models.filter((m) => m.enabled && data.providers.some((p) => p.id === m.providerId && p.enabled && (p.authType !== "oauth" || p.connected)));
  const query = d.search.trim().toLowerCase();
  const groups = data.providers.map((p) => ({ p, models: available.filter((m) => m.providerId === p.id && `${m.modelId} ${m.displayName ?? ""} ${p.name}`.toLowerCase().includes(query)) })).filter((g) => g.models.length);
  const save = async () => {
    if (d.saving) return;
    if (!primaryId) { patch({ error: "请先选择主模型" }); return; }
    const fallback = d.fallbackMode === "inherit" ? data.policy.fallbackModelId : d.fallbackMode === "model" ? d.fallbackId : null;
    if (d.fallbackMode === "model" && !fallback) { patch({ error: "请选择备用模型，或选择不使用备用" }); return; }
    if (primaryId === fallback) { patch({ error: "主模型与备用模型不能相同" }); return; }
    patch({ saving: true, error: "" });
    const r = await act(stage ? { action: "stage", stage, revision: d.revision, policy: {
      modelId: d.primaryMode === "inherit" ? null : d.primaryId, fallbackMode: d.fallbackMode,
      fallbackModelId: d.fallbackMode === "model" ? d.fallbackId : null,
      outputTokens: provider?.protocol !== "codex" && d.outputTokens ? Number(d.outputTokens) : null,
      effort: supportsEffort && d.effort ? d.effort : null,
    } } : { action: "defaults", defaultModelId: primaryId, fallbackModelId: fallback, revision: d.revision }, "配置已保存，将用于下一次运行");
    if (!alive.current) return;
    if (r) onClose();
    else patch({ saving: false, error: "保存未完成，请查看提示后重试。" });
  };
  return <Dialog title={d.field ? `选择${d.field === "primary" ? "主模型" : "备用模型"}` : stage ? `编辑${names[stage]}` : "默认模型设置"}
    tall={!!d.field} onBack={d.field ? () => patch({ field: null, search: "" }) : undefined} onClose={onClose}
    footer={d.field ? undefined : <><Action onClick={onClose}>取消</Action><Action tone="primary" busy={d.saving} onClick={save}>保存修改</Action></>}>
    {d.field ? <div className="space-y-5">
      <SearchInput autoFocus value={d.search} onChange={(search) => patch({ search })} placeholder="搜索模型名称、ID 或服务商" />
      <div className="space-y-5">{groups.map(({ p, models }) => <section key={p.id}><h3 className="mb-2 flex items-center gap-2 text-[13px] font-medium text-slate-500"><LlmIconImg icon={p.icon} name={p.name} size={18} />{p.name}</h3><div className="space-y-2">{models.map((m) => {
        const chosen = m.id === (d.field === "primary" ? d.primaryId : d.fallbackId);
        return <button type="button" key={m.id} aria-pressed={chosen} className={`mw-choice ${chosen ? "is-selected" : ""}`} onClick={() => patch({ ...(d.field === "primary" ? { primaryId: m.id, primaryMode: "model" } : { fallbackId: m.id, fallbackMode: "model" }), field: null, search: "", error: "" })}>
          <ModelLabel id={m.id} data={data} /><span className="ml-auto flex shrink-0 items-center gap-2 text-xs text-slate-500">{verificationLabel(m)}{chosen && <Check size={17} className="text-indigo-600" />}</span>
        </button>;
      })}</div></section>)}</div>
      {!groups.length && <div className="mw-empty"><Search size={24} /><p>{query ? "没有匹配的模型" : "没有已启用且可用的模型"}</p>{query && <Action onClick={() => patch({ search: "" })}>清空搜索</Action>}</div>}
    </div> : <div className="space-y-6">
      {d.error && <p role="alert" className="mw-error">{d.error}</p>}
      {d.revision !== data.policy.revision && <div className="mw-warning">配置已在其他位置更新。<button type="button" onClick={reset} className="ml-2 underline">读取最新配置</button></div>}
      <section className="space-y-3"><h3 className="font-medium text-slate-800">{stage ? "主模型" : "默认模型"}</h3>
        {stage && <div className="mw-segments">{[["inherit", "沿用默认"], ["model", "单独指定"]].map(([mode, label]) => <button type="button" key={mode} aria-pressed={d.primaryMode === mode} onClick={() => patch({ primaryMode: mode, error: "" })}>{label}</button>)}</div>}
        <button type="button" className="mw-choice" disabled={!!stage && d.primaryMode === "inherit"} onClick={() => patch({ field: "primary", search: "" })}><ModelLabel id={primaryId} data={data} /><ChevronRight size={18} className="ml-auto shrink-0 text-slate-400" /></button>
      </section>
      <section className="space-y-3"><h3 className="font-medium text-slate-800">{stage ? "备用模型" : "全局备用模型"}</h3>
        <div className="mw-segments">{[...(stage ? [["inherit", "沿用全局"]] : []), ["none", "不使用"], ["model", "指定模型"]].map(([mode, label]) => <button type="button" key={mode} aria-pressed={d.fallbackMode === mode} onClick={() => patch({ fallbackMode: mode as typeof d.fallbackMode, error: "" })}>{label}</button>)}</div>
        {d.fallbackMode !== "none" && <button type="button" className="mw-choice" disabled={d.fallbackMode === "inherit"} onClick={() => patch({ field: "fallback", search: "" })}><ModelLabel id={d.fallbackMode === "inherit" ? data.policy.fallbackModelId : d.fallbackId} data={data} /><ChevronRight size={18} className="ml-auto shrink-0 text-slate-400" /></button>}
      </section>
      {stage && <details className="mw-details"><summary>高级设置</summary><div className="space-y-5">
        {provider?.protocol !== "codex" && <FormField label="输出预算（tokens）"><TextInput type="number" min={256} max={2000000} value={d.outputTokens} onChange={(e) => patch({ outputTokens: e.target.value })} placeholder="自动" /></FormField>}
        {supportsEffort && <FormField label="思考强度"><Dropdown label="思考强度" value={d.effort} onChange={(effort) => patch({ effort })} options={[["", "模型默认"], ["low", "低"], ["medium", "中"], ["high", "高"], ["xhigh", "很高"], ["max", "最高"]].map(([value, label]) => ({ value, label, text: label }))} /></FormField>}
        {provider?.protocol === "codex" && <p className="text-[13px] text-slate-500">该订阅接口自动管理输出长度。</p>}
      </div></details>}
    </div>}
  </Dialog>;
}
