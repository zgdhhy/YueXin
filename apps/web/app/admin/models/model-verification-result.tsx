"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import type { WorkspaceData, WorkspaceModel, WorkspaceProvider } from "@/lib/model-workspace";
import { Action, Dialog, type Act } from "./workspace-ui";

/** 验证结果独立于添加表单，进度由页面中的模型请求决定。 */
export function ModelVerificationResult({ model, provider, policy, act, testing, onTest, onClose }: {
  model: WorkspaceModel; provider: WorkspaceProvider; policy: WorkspaceData["policy"]; act: Act;
  testing: boolean; onTest: () => void; onClose: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const verification = model.verification;
  const setDefault = async () => {
    if (saving || testing) return;
    setSaving(true); setError("");
    const result = await act({ action: "defaults", defaultModelId: model.id,
      fallbackModelId: policy.fallbackModelId === model.id ? null : policy.fallbackModelId,
      revision: policy.revision }, "默认模型已保存，将用于下一次运行", e => { if (alive.current) setError(e.message); });
    if (!alive.current) return;
    setSaving(false);
    if (result) onClose();
  };
  return <Dialog title="模型验证结果" subtitle={provider.name} onClose={onClose}
    footer={<><Action disabled={testing} busy={saving} onClick={setDefault}>设为默认</Action><Action tone="primary" disabled={saving} onClick={onClose}>{testing ? "关闭" : "完成"}</Action></>}>
    <div className="space-y-4">
      <h3 className="break-all text-base font-semibold text-slate-900">{model.displayName || model.modelId}</h3>
      <div className={testing ? "mw-info" : verification.status === "passed" ? "mw-success" : "mw-warning"}>
        {testing ? <span className="flex items-center gap-2"><Loader2 size={17} className="animate-spin" />正在验证，可先关闭弹窗</span>
          : verification.status === "passed" ? `验证通过 · ${((verification.latencyMs ?? 0) / 1000).toFixed(1)} 秒` : "尚未验证通过，模型已保留。"}
      </div>
      {error && <p role="alert" className="mw-error">{error}</p>}
      {!testing && verification.error && <p role="alert" className="mw-error">{verification.error}</p>}
      {!testing && verification.status !== "passed" && <Action onClick={onTest}>重试测试</Action>}
    </div>
  </Dialog>;
}
