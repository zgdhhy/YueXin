"use client";

import { ChevronRight, LogIn, Plus } from "lucide-react";
import type { Stage } from "@paper/core";
import type { WorkspaceData, WorkspaceModel, WorkspaceProvider } from "@/lib/model-workspace";
import { LlmIconImg } from "@/components/admin/llm-icon-img";
import { cn } from "@/lib/cn";
import { verificationLabel } from "./policy-editor";
import { Action } from "./workspace-ui";

export type OpenPanel = (next: { kind: "provider" | "models" | "model" | "account"; providerId?: number; modelId?: number }) => void;
export const STAGES: [Stage, string][] = [["rerank", "选题精选"], ["digest", "论文解读"], ["storyboard", "讲解脚本"], ["code", "动画代码"], ["report", "趋势月报"], ["chat", "对话"]];
const address = (p: WorkspaceProvider) => { try { return p.baseUrl ? new URL(p.baseUrl).host : p.protocol === "codex" ? "chatgpt.com" : p.protocol === "anthropic" ? "api.anthropic.com" : "官方接口"; } catch { return "接口地址待修正"; } };
const loggedOut = (p: WorkspaceProvider) => p.authType === "oauth" && !p.connected;
export const usable = (p: WorkspaceProvider) => p.enabled && !loggedOut(p);

/** 模型在工作流里的角色：默认/备用，以及单独指定了它的环节；沿用默认的环节不重复列出。 */
export function roles(m: WorkspaceModel, data: WorkspaceData) {
  const r: string[] = [];
  if (data.policy.defaultModelId === m.id) r.push("默认");
  if (data.policy.fallbackModelId === m.id) r.push("备用");
  for (const [id, name] of STAGES) {
    const s = data.resolved[id];
    if (s.source === "override" && s.primaryId === m.id) r.push(name);
    if (s.fallbackSource === "model" && s.fallbackId === m.id) r.push(`${name}备用`);
  }
  return r;
}

/** 验证状态胶囊；服务商停用或模型停用时显示停用状态。 */
export function VerificationPill({ model, provider, testing }: { model: WorkspaceModel; provider: WorkspaceProvider; testing: boolean }) {
  const status = testing ? "testing" : model.verification.status;
  const tone = !model.enabled || !provider.enabled ? "" : status === "passed" ? "is-good" : status === "failed" ? "is-bad" : "";
  return <span className={cn("mw-pill mw-status-pill", tone)}>{testing ? "验证中" : !provider.enabled ? "服务商已停用" : verificationLabel(model)}</span>;
}

/** 服务商分组：标题与模型行都可点击，具体操作在弹窗里。 */
export function ProvidersSection({ data, jobs, open }: { data: WorkspaceData; jobs: Set<string>; open: OpenPanel }) {
  return <section className="mw-block" aria-labelledby="mw-providers-title">
    <h2 id="mw-providers-title" className="mw-block-title">服务商</h2>
    {!data.providers.length ? <div className="mw-card mw-empty"><p>还没有服务商</p><Action tone="primary" onClick={() => open({ kind: "provider" })}>连接第一个服务商</Action></div>
      : <div className="mw-provider-stack">{data.providers.map((p) => {
        const models = data.models.filter((m) => m.providerId === p.id);
        const state = !p.enabled ? "已停用" : loggedOut(p) ? "待登录" : null;
        return <section key={p.id} className={cn("mw-card mw-provider", !p.enabled && "is-disabled")} aria-label={p.name}>
          <button type="button" className="mw-provider-head" onClick={() => open({ kind: "provider", providerId: p.id })}>
            <span className="mw-logo"><LlmIconImg icon={p.icon} name={p.name} size={24} /></span>
            <span className="mw-provider-copy"><strong>{p.name}</strong><span>{address(p)}</span></span>
            {state && <span className={cn("mw-pill", loggedOut(p) && p.enabled && "is-warn")}>{state}</span>}
            <ChevronRight size={18} className="mw-chevron" aria-hidden="true" />
          </button>
          {models.map((m) => <button type="button" key={m.id} className={cn("mw-model-row", !m.enabled && "is-disabled")} onClick={() => open({ kind: "model", modelId: m.id })}>
            <span className="mw-model-name">{m.displayName || m.modelId}</span>
            {roles(m, data).map((r) => <span key={r} className={cn("mw-pill", r === "默认" && "is-accent")}>{r}</span>)}
            <VerificationPill model={m} provider={p} testing={jobs.has(`test:${m.id}`)} />
            <ChevronRight size={16} className="mw-chevron" aria-hidden="true" />
          </button>)}
          <button type="button" className="mw-add-row" onClick={() => open({ kind: loggedOut(p) ? "account" : "models", providerId: p.id })}>{loggedOut(p) ? <><LogIn size={15} />登录账号</> : <><Plus size={15} />添加模型</>}</button>
        </section>;
      })}</div>}
  </section>;
}
