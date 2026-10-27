"use client";

import { useEffect, useState } from "react";
import { Check, Copy, ExternalLink, Loader2 } from "lucide-react";
import type { WorkspaceData, WorkspaceProvider } from "@/lib/model-workspace";
import { Action, Dialog, DraftHint, IconButton, request, useDraft, type Act, type DraftStore } from "./workspace-ui";

export function AccountPanel({ provider: p, data, store, act, onClose }: {
  provider: WorkspaceProvider; data: WorkspaceData; store: DraftStore; act: Act; onClose: () => void;
}) {
  const key = `account:${p.id}`;
  const { draft: d, setDraft, discard, resumed } = useDraft(store, key, () => ({ input: "", busy: "", error: "" }));
  const patch = (next: Partial<typeof d>) => setDraft((prev) => ({ ...prev, ...next }));
  const [attempt, setAttempt] = useState(0);
  const [copied, setCopied] = useState(false);
  const pending = p.pending;
  useEffect(() => {
    if (pending?.method !== "device") return;
    let live = true; const controller = new AbortController(); let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      try {
        const r = await request({ action: "oauth-poll", id: p.id }, controller.signal);
        if (!live) return;
        if (r.pending) timer = setTimeout(tick, Math.max(2, pending.interval) * 1000);
        else { patch({ input: "", error: "" }); await act({ action: "refresh" }, "账号授权成功"); }
      } catch (e) { if (live) patch({ error: e instanceof Error ? e.message : "授权检查失败" }); }
    };
    timer = setTimeout(tick, Math.max(2, pending.interval) * 1000);
    return () => { live = false; clearTimeout(timer); controller.abort(); };
  }, [p.id, pending?.startedAt, attempt]);
  const run = async (busy: string, command: object) => {
    if (d.busy) return; patch({ busy, error: "" });
    const result = await act(command, undefined, (e) => patch({ error: e.message }));
    patch({ busy: "", ...(result ? { input: "" } : {}) });
  };
  return <Dialog title="订阅账号授权" subtitle={p.name} onClose={onClose}
    footer={<Action tone={p.connected ? "primary" : "plain"} onClick={() => { if (p.connected) discard(); onClose(); }}>{p.connected ? "完成" : "关闭"}</Action>}>
    <DraftHint resumed={resumed && store.has(key)} onDiscard={() => { if (!d.busy) discard(); }} />
    <div className="space-y-5">
      <div className={p.connected ? "mw-success" : "mw-info"}>{p.connected ? `已授权：${p.account ?? "ChatGPT 账号"}${p.plan ? ` · ${p.plan}` : ""}` : "尚未授权 ChatGPT 账号"}</div>
      {d.error && <div role="alert" className="mw-error"><p>{d.error}</p>{pending?.method === "device" && <button type="button" className="mt-2 underline" onClick={() => { patch({ error: "" }); setAttempt((v) => v + 1); }}>重试授权检查</button>}</div>}
      {pending?.method === "device" ? <>
        <p className="text-sm leading-relaxed text-slate-600">打开授权页面，登录 ChatGPT，输入设备码后确认授权。</p>
        <a className="mw-action mw-primary" href="https://auth.openai.com/codex/device" target="_blank" rel="noreferrer">打开授权页面<ExternalLink size={15} /></a>
        <div className="flex items-center justify-between rounded-lg bg-slate-50 p-5"><code className="text-xl font-semibold tracking-widest text-slate-900">{pending.userCode}</code><IconButton label="复制设备码" onClick={async () => { try { await navigator.clipboard.writeText(pending.userCode); setCopied(true); } catch { patch({ error: "复制失败，请手动复制设备码" }); } }}>{copied ? <Check size={17} /> : <Copy size={17} />}</IconButton></div>
        {!d.error && <p className="flex items-center gap-2 text-[13px] text-slate-500"><Loader2 size={15} className="animate-spin" />等待确认，关闭后可继续本次授权</p>}
        <p className="text-[13px] leading-relaxed text-slate-500">首次使用可能需要在 ChatGPT 的安全设置中开启设备码登录。</p>
        <Action busy={d.busy === "cancel"} onClick={() => run("cancel", { action: "oauth-clear", id: p.id, logout: false })}>取消本次授权</Action>
      </> : pending?.method === "browser" ? <>
        <a className="mw-action mw-primary" href={pending.url} target="_blank" rel="noreferrer">打开浏览器授权页面<ExternalLink size={15} /></a>
        <p className="text-[13px] leading-relaxed text-slate-500">授权后会跳转到 localhost:1455；即使页面打不开，也可复制地址栏中的完整回调地址。</p>
        <Credentials input={d.input} setInput={(input) => patch({ input })} busy={!!d.busy} onSubmit={() => run("complete", { action: "oauth-complete", id: p.id, input: d.input })} />
        <Action busy={d.busy === "cancel"} onClick={() => run("cancel", { action: "oauth-clear", id: p.id, logout: false })}>取消本次授权</Action>
      </> : <>
        <Action className="w-full" tone="primary" busy={d.busy === "device"} disabled={!!d.busy} onClick={() => run("device", { action: "oauth-start", id: p.id, method: "device" })}>{p.connected ? "重新授权账号" : "使用设备码登录"}</Action>
        <Action className="w-full" busy={d.busy === "browser"} disabled={!!d.busy} onClick={() => run("browser", { action: "oauth-start", id: p.id, method: "browser" })}>使用浏览器登录</Action>
        <details className="mw-details"><summary>导入本机 Codex 凭据</summary><div><p className="mb-3 text-[13px] text-slate-500">粘贴 ~/.codex/auth.json，凭据仅发送到服务端。</p><Credentials input={d.input} setInput={(input) => patch({ input })} busy={!!d.busy} onSubmit={() => run("complete", { action: "oauth-complete", id: p.id, input: d.input })} /></div></details>
        {p.connected && <Action tone="danger" busy={d.busy === "logout"} onClick={() => run("logout", { action: "oauth-clear", id: p.id, logout: true })}>退出当前账号</Action>}
      </>}
    </div>
  </Dialog>;
}
function Credentials({ input, setInput, busy, onSubmit }: { input: string; setInput: (v: string) => void; busy: boolean; onSubmit: () => void }) {
  return <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); if (input.trim() && !busy) onSubmit(); }}><textarea aria-label="授权回调或凭据" className="mw-input resize-y font-mono text-[13px]" rows={4} value={input} onChange={(e) => setInput(e.target.value)} placeholder="粘贴完整回调地址或 auth.json" /><Action type="submit" tone="primary" busy={busy} disabled={!input.trim()}>完成授权</Action></form>;
}
