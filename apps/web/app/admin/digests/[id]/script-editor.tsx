"use client";

import { useState, useTransition } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2, Wand2, X } from "lucide-react";
import type { ExplainerScript, ShotEdit } from "@paper/core";
import { buttonCls, Input, Textarea } from "@/components/admin/ui";
import { regenerateFromScript, reviseShotAction, saveScriptAction } from "../../actions";
import { SubmitButton } from "@/components/admin/admin-client";

type Shot = ExplainerScript["shots"][number];
type Draft = ShotEdit & { saved?: Shot };

const toDraft = (s: Shot): Draft => ({ id: s.id, heading: s.heading, visual: s.visual, cues: s.cues.map((c) => ({ ...c })), saved: s });
const sameDraft = (d: Draft) => !!d.saved && d.heading === d.saved.heading && d.visual === d.saved.visual && JSON.stringify(d.cues) === JSON.stringify(d.saved.cues);

function status(s?: Shot) {
  if (!s || !s.code) return { text: "待写代码", cls: "bg-slate-100 text-slate-600" };
  if (s.codeError) return { text: "简单画面", cls: "bg-amber-50 text-amber-700" };
  return { text: "代码就绪", cls: "bg-emerald-50 text-emerald-700" };
}

/** 讲解脚本编辑：改文案与画面说明、增删调序、逐镜头让 AI 改代码；保存后「重新生成视频」只重写改过的镜头 */
export function ScriptEditor({ digestId, script, styles, thumbBase }: { digestId: number; script: ExplainerScript; styles: { id: number; name: string }[]; thumbBase: string }) {
  const [title, setTitle] = useState(script.title);
  const [styleId, setStyleId] = useState(script.styleId);
  const [shots, setShots] = useState<Draft[]>(script.shots.map(toDraft));
  const [savedMeta, setSavedMeta] = useState({ title: script.title, styleId: script.styleId, count: script.shots.length });
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);
  const [revise, setRevise] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const dirty = title !== savedMeta.title || styleId !== savedMeta.styleId || shots.length !== savedMeta.count || shots.some((d) => !sameDraft(d));

  const update = (i: number, patch: Partial<Draft>) => setShots((list) => list.map((d, k) => (k === i ? { ...d, ...patch } : d)));
  const move = (i: number, by: number) => setShots((list) => {
    const next = [...list];
    const [x] = next.splice(i, 1);
    next.splice(i + by, 0, x);
    return next;
  });
  const save = () =>
    start(async () => {
      const r = await saveScriptAction(digestId, { title, styleId, shots: shots.map(({ id, heading, visual, cues }) => ({ id, heading, visual, cues })) });
      if (r.error || !r.script) return setMsg({ text: r.error ?? "保存失败", error: true });
      setShots(r.script.shots.map(toDraft));
      setSavedMeta({ title: r.script.title, styleId: r.script.styleId, count: r.script.shots.length });
      setMsg({ text: "已保存。改过画面说明的镜头会在重新生成视频时重写代码" });
    });

  return (
    <div className="space-y-4">
      <div className="script-toolbar">
        <Input value={title} onChange={(e) => setTitle(e.target.value)} aria-label="视频标题" className="min-w-0 flex-1" />
        <select value={styleId ?? ""} onChange={(e) => setStyleId(Number(e.target.value))} aria-label="视频风格">
          {styles.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <button type="button" className={buttonCls(dirty ? "primary" : "secondary")} disabled={!dirty || pending} onClick={save}>{pending ? "保存中…" : "保存脚本"}</button>
        <form action={regenerateFromScript}>
          <input type="hidden" name="digestId" value={digestId} />
          <SubmitButton variant={dirty ? "secondary" : "primary"} disabled={dirty} pendingText="提交中…" confirm="按当前脚本重新生成视频？只重写改过或出错的镜头代码，再整体渲染。">重新生成视频</SubmitButton>
        </form>
      </div>
      {script.styleReason && styleId === script.styleId && <p className="text-[13px] text-slate-500">选择这个风格的理由：{script.styleReason}</p>}
      {msg && <p role={msg.error ? "alert" : "status"} className={`text-[13px] ${msg.error ? "text-red-600" : "text-emerald-700"}`}>{msg.text}</p>}
      <ol className="space-y-4">
        {shots.map((d, i) => {
          const st = status(sameDraft(d) || d.visual === d.saved?.visual ? d.saved : undefined);
          return (
            <li key={d.id ?? `new-${i}`} className="script-shot">
              <div className="script-shot-head">
                {d.saved?.thumb ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={`${thumbBase}/${d.saved.thumb.split("/").map(encodeURIComponent).join("/")}?t=${script.updatedAt}`} alt="" className="script-thumb" />
                ) : (
                  <span className="script-thumb" />
                )}
                <span className="text-sm font-semibold text-slate-400 tabular-nums">{i + 1}</span>
                <Input value={d.heading} onChange={(e) => update(i, { heading: e.target.value })} aria-label={`镜头 ${i + 1} 标题`} className="min-w-0 flex-1" />
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${st.cls}`} title={d.saved?.codeError ?? undefined}>{st.text}</span>
                <span className="flex shrink-0">
                  <button type="button" className="script-icon" aria-label="上移" disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp size={15} /></button>
                  <button type="button" className="script-icon" aria-label="下移" disabled={i === shots.length - 1} onClick={() => move(i, 1)}><ArrowDown size={15} /></button>
                  <button type="button" className="script-icon text-red-500" aria-label="删除镜头" disabled={shots.length === 1} onClick={() => setShots((l) => l.filter((_, k) => k !== i))}><Trash2 size={15} /></button>
                </span>
              </div>
              <Textarea value={d.visual} onChange={(e) => update(i, { visual: e.target.value })} rows={2} aria-label={`镜头 ${i + 1} 画面说明`} placeholder="画面说明：画什么、怎么随字幕变化" />
              <div className="space-y-2">
                {d.cues.map((c, k) => (
                  <div key={k} className="script-cue">
                    <Input value={c.zh} onChange={(e) => update(i, { cues: d.cues.map((x, j) => (j === k ? { ...x, zh: e.target.value } : x)) })} aria-label="中文字幕" />
                    <Input value={c.en} onChange={(e) => update(i, { cues: d.cues.map((x, j) => (j === k ? { ...x, en: e.target.value } : x)) })} aria-label="英文字幕" className="text-slate-500" />
                    <button type="button" className="script-icon" aria-label="删除字幕" disabled={d.cues.length === 1} onClick={() => update(i, { cues: d.cues.filter((_, j) => j !== k) })}><X size={15} /></button>
                  </div>
                ))}
                {d.cues.length < 6 && <button type="button" className="text-[13px] text-indigo-600" onClick={() => update(i, { cues: [...d.cues, { zh: "", en: "" }] })}>＋ 字幕</button>}
              </div>
              {d.saved && sameDraft(d) && (
                <div className="script-revise">
                  <Input value={revise[d.saved.id] ?? ""} onChange={(e) => setRevise((r) => ({ ...r, [d.saved!.id]: e.target.value }))} placeholder="让 AI 改这个镜头，例如：箭头动画慢一点，原图放大" aria-label="修改意见" />
                  <button
                    type="button"
                    className={buttonCls("secondary", "sm")}
                    disabled={!revise[d.saved.id]?.trim() || busy != null}
                    onClick={async () => {
                      const id = d.saved!.id;
                      setBusy(id);
                      const r = await reviseShotAction(digestId, id, revise[id]);
                      setBusy(null);
                      if (r.error || !r.shot) return setMsg({ text: r.error ?? "修改失败", error: true });
                      setShots((l) => l.map((x) => (x.id === id ? toDraft(r.shot!) : x)));
                      setRevise((m) => ({ ...m, [id]: "" }));
                      setMsg({ text: `镜头 ${i + 1} 的代码已更新，重新生成视频后生效` });
                    }}
                  >
                    <Wand2 className="h-3.5 w-3.5" />{busy === d.saved.id ? "修改中…" : "让 AI 改"}
                  </button>
                </div>
              )}
              {d.saved?.code && (
                <details className="script-code">
                  <summary>查看代码{d.saved.codeError ? ` · ${d.saved.codeError}` : ""}</summary>
                  <pre>{d.saved.code}</pre>
                </details>
              )}
            </li>
          );
        })}
      </ol>
      <button type="button" className={buttonCls("secondary", "sm")} onClick={() => setShots((l) => [...l, { heading: "新镜头", visual: "", cues: [{ zh: "", en: "" }] }])}>
        <Plus className="h-3.5 w-3.5" />添加镜头
      </button>
      {dirty && <p className="text-[13px] text-amber-700">有未保存的修改：保存后才能重新生成视频。</p>}
    </div>
  );
}
