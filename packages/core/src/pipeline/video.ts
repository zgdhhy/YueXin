import crypto from "node:crypto";
import fs from "node:fs";
import { eq } from "drizzle-orm";
import { scriptSchema, type Script } from "@paper/video/script";
import { compileShot, renderExplainer, type RenderShotInput } from "@paper/video/render";
import { db, schema } from "../db";
import type { StoredShot } from "../db/schema";
import { dataPath, env } from "../env";
import { generateJson, llmForStage } from "../llm";
import { codePrompt } from "../prompts/code";
import { scriptPrompt } from "../prompts/script";
import { requirementsFor } from "../requirements";
import { getScript, loadDigest, saveShots, shotArgs, shotId, styleSpec, writeCode, type ShotContext } from "../script";
import { getSetting } from "../settings";
import { defaultStyle, getStyle, styleChoices, type VideoStyle } from "../styles";
import { synthesizeSpeech, wavDuration } from "../tts";
import { cachedPaperText } from "./fetchPaper";
import type { Log } from "./select";

/**
 * 讲解视频（ADR 0003）：讲解脚本 → 逐镜头写动画代码 → 固定框架渲染。
 * 镜头代码编译或渲染失败时不重试，该镜头退化为「标题 + 文案」，并记录原因供后台显示。
 */
/** 写脚本时带上的原文长度上限 */
const PAPER_CHARS = 60_000;

/** 按当前（或运行锁定的）写作要求写讲解脚本，不写库；试写也用它 */
export async function generateScript(digestId: number, log: Log, opts: { styleId?: number } = {}): Promise<{ script: Script & { styleId: number }; versionId: number }> {
  const { digest, paper, figures } = loadDigest(digestId);
  const { fixed, options } = styleChoices(opts.styleId);
  const llm = llmForStage("storyboard");
  const requirements = requirementsFor("storyboard");
  log(`写讲解脚本中（${llm.label}，写作要求 v${requirements.number}，${fixed ? `风格：${fixed.name}` : `从 ${options.length} 个风格中挑选`}）…`);
  const ids = new Set(options.map((s) => s.id));
  const script = await generateJson(
    llm,
    {
      system: requirements.content,
      prompt: scriptPrompt({
        title: `${digest.titleZh}（${paper.title}）`,
        paper: cachedPaperText(paper.id, PAPER_CHARS),
        digest: digest.contentMd.replace(/!\[([^\]]*)\]\(figure:\/\/([^)]+)\)/g, "[原图 $2：$1]"),
        figures: figures.map((f) => `${f.label} | ${f.caption}`).join("\n"),
        styles: options.map((s) => `- ${s.id}：${styleSpec(s).split("\n")[0]}`).join("\n"),
        fixedStyle: fixed ? styleSpec(fixed) : null,
      }),
    },
    scriptSchema.refine((s) => !!fixed || (s.styleId != null && ids.has(s.styleId)), "styleId 必须是列出的风格编号"),
  );
  const styleId = fixed?.id ?? script.styleId!;
  const cues = script.shots.reduce((n, s) => n + s.cues.length, 0);
  log(`脚本完成：《${script.title}》，${script.shots.length} 个镜头，${cues} 条字幕，风格「${getStyle(styleId)?.name}」${script.styleReason ? `（${script.styleReason}）` : ""}`);
  return { script: { ...script, styleId }, versionId: requirements.id };
}

/** 写讲解脚本并保存（覆盖旧脚本，所有镜头需要重写代码） */
export async function writeScript(digestId: number, log: Log, opts: { styleId?: number } = {}) {
  const { script, versionId } = await generateScript(digestId, log, opts);
  const values = {
    styleId: script.styleId,
    styleReason: script.styleReason ?? null,
    title: script.title,
    shots: script.shots.map((s) => ({ id: shotId(), heading: s.heading, visual: s.visual, cues: s.cues, code: null, codeError: null, thumb: null })),
    requirementsVersionId: versionId,
    updatedAt: new Date().toISOString(),
  };
  db.insert(schema.explainerScripts)
    .values({ digestId, ...values })
    .onConflictDoUpdate({ target: schema.explainerScripts.digestId, set: values })
    .run();
  return getScript(digestId)!;
}

/** 为还没有代码或上次出错的镜头写动画代码（逐个保存进度） */
export async function writeShotCodes(digestId: number, log: Log) {
  const script = getScript(digestId);
  if (!script) throw new Error("还没有讲解脚本");
  const { figures } = loadDigest(digestId);
  const ctx: ShotContext = { style: getStyle(script.styleId) ?? defaultStyle(), figures: figures.map((f) => f.label), total: script.shots.length };
  const shots = [...script.shots];
  const todo = shots.map((s, i) => [s, i] as const).filter(([s]) => !s.code || s.codeError);
  log(todo.length ? `需要写代码的镜头：${todo.length} / ${shots.length}（${llmForStage("code").label}）` : "所有镜头都已有代码");
  for (const [shot, i] of todo) {
    const r = await writeCode(codePrompt(shotArgs(shot, i, ctx)));
    shots[i] = { ...shot, ...r };
    saveShots(digestId, shots);
    log(r.codeError ? `镜头 ${i + 1}「${shot.heading}」将以简单画面呈现：${r.codeError}` : `镜头 ${i + 1}「${shot.heading}」代码完成`);
  }
}

/** 旁白：逐条字幕合成语音，按内容缓存；失败时整段视频退回无旁白 */
async function narrate(paperId: string, shots: StoredShot[], log: Log): Promise<(RenderShotInput["narration"])[] | null> {
  const cfg = getSetting("video").narration;
  if (!cfg.enabled) return null;
  const dir = `videos/${paperId}/narration`;
  fs.mkdirSync(dataPath(dir), { recursive: true });
  const out: RenderShotInput["narration"][] = [];
  try {
    for (const shot of shots) {
      const list: { path: string; sec: number }[] = [];
      for (const cue of shot.cues) {
        const key = crypto.createHash("sha1").update(`${cue.zh}|${cfg.providerId}|${cfg.model}|${cfg.voice}|${cfg.speed}`).digest("hex").slice(0, 16);
        const rel = `${dir}/${key}.wav`;
        if (!fs.existsSync(dataPath(rel))) fs.writeFileSync(dataPath(rel), (await synthesizeSpeech(cue.zh, cfg)).audio);
        list.push({ path: rel, sec: wavDuration(fs.readFileSync(dataPath(rel))) });
      }
      out.push(list);
    }
    log(`旁白合成完成：${out.reduce((n, l) => n + (l?.length ?? 0), 0)} 段`);
    return out;
  } catch (e) {
    log(`旁白合成失败，本次不加旁白：${e instanceof Error ? e.message : String(e)}`);
    return null;
  }
}

function pickMusic(seed: number): { path: string | null; procedural: boolean } {
  const mode = getSetting("video").musicMode;
  if (mode === "none") return { path: null, procedural: false };
  if (mode === "library") {
    const tracks = db.select().from(schema.musicTracks).all();
    if (tracks.length) return { path: tracks[seed % tracks.length].path, procedural: false };
  }
  // 曲库为空时退回程序化合成
  return { path: null, procedural: true };
}

/** 把一组镜头渲染成视频，返回时长、失败的镜头与缩略图 */
async function renderShots(o: { shots: StoredShot[]; style: VideoStyle; figures: Record<string, string>; paperId: string; meta: { arxivId: string; paperTitle: string; date: string }; outPath: string; thumbsDir?: string; seed: number; log: Log }) {
  const video = getSetting("video");
  const music = pickMusic(o.seed);
  const narration = await narrate(o.paperId, o.shots, o.log);
  const inputs: RenderShotInput[] = o.shots.map((s, i) => {
    const compiled = s.code && !s.codeError ? compileShot(s.code) : null;
    return { heading: s.heading, cues: s.cues, js: compiled?.js ?? null, narration: narration?.[i] ?? null };
  });
  o.log(`渲染视频中（风格「${o.style.name}」，背景音乐：${music.path ?? (music.procedural ? "程序化合成" : "无")}）…`);
  let lastLogged = 0;
  return renderExplainer({
    dataDir: env.dataDir,
    shots: inputs,
    style: o.style.tokens,
    figures: o.figures,
    musicPath: music.path,
    procedural: music.procedural,
    seed: o.seed,
    musicVolume: video.musicVolume,
    readingSpeed: video.readingSpeed,
    meta: o.meta,
    outPath: o.outPath,
    thumbsDir: o.thumbsDir,
    onProgress: (p) => {
      if (p - lastLogged >= 0.1 || p === 1) {
        lastLogged = p;
        o.log(`渲染进度 ${(p * 100).toFixed(0)}%`);
      }
    },
  });
}

export async function renderVideo(digestId: number, log: Log) {
  const script = getScript(digestId);
  if (!script) throw new Error("还没有讲解脚本");
  const { digest, paper, figures } = loadDigest(digestId);
  const style = getStyle(script.styleId) ?? defaultStyle();
  const outPath = `videos/${digest.paperId}/explainer.mp4`;
  const result = await renderShots({
    shots: script.shots,
    style,
    figures: Object.fromEntries(figures.map((f) => [f.label, f.path])),
    paperId: digest.paperId,
    meta: { arxivId: paper.id, paperTitle: paper.title, date: digest.createdAt.slice(0, 10) },
    outPath,
    thumbsDir: `videos/${digest.paperId}/shots`,
    seed: digestId * 7919,
    log,
  });
  const failed = new Map(result.failed.map((f) => [f.index, f.error]));
  saveShots(
    digestId,
    script.shots.map((s, i) => ({ ...s, thumb: result.thumbs[i] ?? s.thumb, codeError: failed.has(i) ? `渲染出错：${failed.get(i)}` : s.codeError })),
  );
  for (const [i, e] of failed) log(`镜头 ${i + 1} 渲染出错，已以简单画面呈现：${e}`);
  db.insert(schema.videos)
    .values({ digestId, path: outPath, durationSec: result.durationSec, styleId: style.id })
    .onConflictDoUpdate({ target: schema.videos.digestId, set: { path: outPath, durationSec: result.durationSec, styleId: style.id, createdAt: new Date().toISOString() } })
    .run();
  log(`视频完成：${Math.floor(result.durationSec / 60)} 分 ${Math.round(result.durationSec % 60)} 秒`);
}

// ---------- 风格样片 ----------

/** 样片用的固定脚本：讲一个人人熟悉的概念，便于比较不同风格 */
const SAMPLE_SHOTS: Pick<StoredShot, "heading" | "visual" | "cues">[] = [
  {
    heading: "注意力在看哪里",
    visual: "开场：屏幕中央出现一句话「猫坐在垫子上，因为它很累」，然后从「它」向「猫」画出一条醒目的连线，其他词变暗。",
    cues: [
      { zh: "读到「它」这个字时，你会自然想到前面的「猫」。", en: "When you read 'it', you naturally think of 'the cat'." },
      { zh: "模型也需要这样的能力：知道该关注哪里。", en: "Models need the same ability: knowing where to look." },
    ],
  },
  {
    heading: "打分、归一、加权",
    visual: "流程演示：左边一列词，每个词旁边逐个出现一个分数条；分数经过归一化变成 0 到 1 的权重；最后按权重把各词的信息汇总到右边一个结果方块里。",
    cues: [
      { zh: "第一步，给每个词打一个相关度分数。", en: "Step one: score each word's relevance." },
      { zh: "第二步，把分数变成加起来等于一的权重。", en: "Step two: turn scores into weights that sum to one." },
      { zh: "第三步，按权重把信息汇总起来。", en: "Step three: combine information by those weights." },
    ],
  },
  {
    heading: "效果有多大",
    visual: "数据对比：两根柱子，「无注意力」28.4 与「有注意力」41.0，第二根用强调色并带数字滚动。",
    cues: [{ zh: "在翻译任务上，加入注意力后分数明显提升。", en: "On translation, adding attention clearly raises the score." }],
  },
];

/** 为风格渲染一段样片（约 20 秒），保存到 styles/<id>/sample.mp4 */
export async function makeStyleSample(styleId: number, log: Log) {
  const style = getStyle(styleId);
  if (!style) throw new Error("风格不存在");
  const ctx: ShotContext = { style, figures: [], total: SAMPLE_SHOTS.length };
  const shots: StoredShot[] = [];
  for (const [i, s] of SAMPLE_SHOTS.entries()) {
    const r = await writeCode(codePrompt(shotArgs(s, i, ctx)));
    log(r.codeError ? `样片镜头 ${i + 1} 将以简单画面呈现：${r.codeError}` : `样片镜头 ${i + 1} 代码完成`);
    shots.push({ id: shotId(), ...s, ...r, thumb: null });
  }
  const outPath = `styles/${styleId}/sample.mp4`;
  const result = await renderShots({ shots, style, figures: {}, paperId: `style-${styleId}`, meta: { arxivId: "", paperTitle: "风格样片", date: "" }, outPath, seed: styleId * 131, log });
  db.update(schema.videoStyles).set({ samplePath: outPath }).where(eq(schema.videoStyles.id, styleId)).run();
  log(`样片完成：${Math.round(result.durationSec)} 秒${result.failed.length ? `，${result.failed.length} 个镜头以简单画面呈现` : ""}`);
}
