"use client";

import { ChevronRight } from "lucide-react";
import type { Stage } from "@paper/core";
import type { WorkspaceData } from "@/lib/model-workspace";
import { cn } from "@/lib/cn";
import { STAGES } from "./providers-section";

/** 工作流：默认行写出主模型与备用；环节只写出与默认不同的部分。 */
export function WorkflowSection({ data, onDefaults, onStage }: { data: WorkspaceData; onDefaults: () => void; onStage: (stage: Stage) => void }) {
  const name = (id: number | null) => { const m = data.models.find((x) => x.id === id); return m ? m.displayName || m.modelId : id ? "原模型已被删除" : null; };
  const { defaultModelId, fallbackModelId } = data.policy;
  return <section className="mw-block" aria-labelledby="mw-workflow-title">
    <h2 id="mw-workflow-title" className="mw-block-title">工作流</h2>
    <div className="mw-card">
      <button type="button" className="mw-stage-row is-default" onClick={onDefaults}>
        <span className="mw-stage-name">默认模型</span>
        <span className="mw-stage-value">{name(defaultModelId) ?? <span className="is-muted">尚未选择</span>}{defaultModelId && <span className="is-muted"> · {fallbackModelId ? `备用 ${name(fallbackModelId)}` : "无备用"}</span>}</span>
        <ChevronRight size={16} className="mw-chevron" aria-hidden="true" />
      </button>
      {STAGES.map(([id, label]) => {
        const r = data.resolved[id]; const waiting = !defaultModelId && r.source === "default";
        const fallback = r.fallbackSource === "none" ? "不用备用" : r.fallbackSource === "model" ? `备用 ${name(r.fallbackId) ?? "未选择"}` : null;
        return <button type="button" key={id} className="mw-stage-row" onClick={() => onStage(id)}>
          <span className="mw-stage-name">{label}</span>
          <span className="mw-stage-value">
            {waiting ? <span className="is-muted">等待默认配置</span> : r.source === "override" ? name(r.primaryId) : <span className="is-muted">沿用默认</span>}
            {!waiting && fallback && <span className={cn(r.source === "override" ? "is-muted" : "")}> · {fallback}</span>}
            {!waiting && r.issues.length > 0 && <span className="mw-stage-issue">{r.issues.join("；")}</span>}
          </span>
          <ChevronRight size={16} className="mw-chevron" aria-hidden="true" />
        </button>;
      })}
    </div>
  </section>;
}
