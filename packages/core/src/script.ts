import crypto from "node:crypto";
import { eq } from "drizzle-orm";
import { compileShot, extractCode } from "@paper/video/compile";
import { db, schema } from "./db";
import type { StoredShot } from "./db/schema";
import { llmForStage } from "./llm";
import { codePrompt, revisePrompt } from "./prompts/code";
import { requirementsFor } from "./requirements";
import { defaultStyle, getStyle, type VideoStyle } from "./styles";

/**
 * 讲解脚本的存取与编辑（ADR 0003）。这里不依赖渲染，web 后台可以直接用；
 * 写脚本、批量写代码与渲染在 pipeline/video.ts（只在 worker 中运行）。
 */
export type ExplainerScript = typeof schema.explainerScripts.$inferSelect;

export const shotId = () => crypto.randomUUID().slice(0, 8);

export function loadDigest(digestId: number) {
  const row = db
    .select()
    .from(schema.digests)
    .innerJoin(schema.papers, eq(schema.papers.id, schema.digests.paperId))
    .where(eq(schema.digests.id, digestId))
    .get();
  if (!row) throw new Error(`解读 ${digestId} 不存在`);
  const figures = db.select().from(schema.figures).where(eq(schema.figures.paperId, row.digests.paperId)).all();
  return { digest: row.digests, paper: row.papers, figures };
}

export function getScript(digestId: number): ExplainerScript | undefined {
  return db.select().from(schema.explainerScripts).where(eq(schema.explainerScripts.digestId, digestId)).get();
}

export function saveShots(digestId: number, shots: StoredShot[]) {
  db.update(schema.explainerScripts).set({ shots, updatedAt: new Date().toISOString() }).where(eq(schema.explainerScripts.digestId, digestId)).run();
}

export const styleSpec = (s: VideoStyle) => `${s.name}（${s.description}）\n${s.guide}`;

export type ShotContext = { style: VideoStyle; figures: string[]; total: number };

export function shotArgs(shot: Pick<StoredShot, "heading" | "visual" | "cues">, index: number, ctx: ShotContext) {
  return {
    style: styleSpec(ctx.style),
    heading: shot.heading,
    visual: shot.visual,
    cues: shot.cues.map((c, i) => `${i}. ${c.zh}`).join("\n"),
    figures: ctx.figures.join("、"),
    index: index + 1,
    total: ctx.total,
  };
}

/** 为一个镜头写代码并编译检查；只写一次，失败时返回原因 */
export async function writeCode(prompt: string): Promise<{ code: string | null; codeError: string | null }> {
  const requirements = requirementsFor("code");
  let text: string;
  try {
    text = await llmForStage("code").generate({ system: requirements.content, prompt });
  } catch (e) {
    return { code: null, codeError: `写代码失败：${e instanceof Error ? e.message : String(e)}` };
  }
  const code = extractCode(text);
  const compiled = compileShot(code);
  return { code, codeError: compiled.error ? `代码检查未通过：${compiled.error}` : null };
}

export type ShotEdit = { id?: string; heading: string; visual: string; cues: { zh: string; en: string }[] };

/**
 * 保存后台编辑后的脚本：画面说明或字幕条数变了的镜头清空代码（重新生成视频时重写），
 * 只改字幕文字的镜头保留代码；新增镜头没有代码。
 */
export function updateScript(digestId: number, edit: { title: string; styleId: number | null; shots: ShotEdit[] }) {
  const script = getScript(digestId);
  if (!script) throw new Error("还没有讲解脚本");
  if (!edit.shots.length) throw new Error("至少保留一个镜头");
  const old = new Map(script.shots.map((s) => [s.id, s]));
  const shots: StoredShot[] = edit.shots.map((e) => {
    const prev = e.id ? old.get(e.id) : undefined;
    const cues = e.cues.filter((c) => c.zh.trim()).map((c) => ({ zh: c.zh.trim(), en: c.en.trim() || c.zh.trim() }));
    if (!cues.length) throw new Error(`镜头「${e.heading}」至少需要一条字幕`);
    const base = { id: prev?.id ?? shotId(), heading: e.heading.trim() || "未命名镜头", visual: e.visual.trim(), cues };
    const keep = prev && prev.visual === base.visual && prev.cues.length === cues.length;
    // 缩略图保留到下次渲染，方便对照修改
    return keep ? { ...prev, ...base } : { ...base, code: null, codeError: null, thumb: prev?.thumb ?? null };
  });
  // 换风格后所有镜头都要按新风格重写
  const restyle = edit.styleId != null && edit.styleId !== script.styleId;
  db.update(schema.explainerScripts)
    .set({
      title: edit.title.trim() || script.title,
      styleId: edit.styleId ?? script.styleId,
      shots: restyle ? shots.map((s) => ({ ...s, code: null, codeError: null })) : shots,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(schema.explainerScripts.digestId, digestId))
    .run();
  return getScript(digestId)!;
}

/** 让大模型按意见修改一个镜头的代码（后台交互，不经运行队列）；编译不通过时不保存 */
export async function reviseShot(digestId: number, id: string, instruction: string) {
  const script = getScript(digestId);
  const index = script?.shots.findIndex((s) => s.id === id) ?? -1;
  if (!script || index < 0) throw new Error("镜头不存在");
  const shot = script.shots[index];
  const { figures } = loadDigest(digestId);
  const ctx: ShotContext = { style: getStyle(script.styleId) ?? defaultStyle(), figures: figures.map((f) => f.label), total: script.shots.length };
  const prompt = shot.code
    ? revisePrompt({ ...shotArgs(shot, index, ctx), code: shot.code, instruction })
    : codePrompt({ ...shotArgs(shot, index, ctx), visual: `${shot.visual}\n补充要求：${instruction}` });
  const r = await writeCode(prompt);
  if (!r.code || r.codeError) throw new Error(r.codeError ?? "没有得到代码");
  const shots = script.shots.map((s, i) => (i === index ? { ...s, code: r.code, codeError: null } : s));
  saveShots(digestId, shots);
  return shots[index];
}

