import { z } from "zod";
import type { StyleTokens } from "./theme";

/** 一条双语字幕；有旁白时按语音时长推进，没有时按阅读时长推进 */
export const cueSchema = z.object({
  zh: z.string().min(1),
  en: z.string().min(1),
});

/** 镜头：一段文案（字幕）加一段画面说明；动画代码另行生成 */
export const shotSchema = z.object({
  heading: z.string().min(1),
  visual: z.string().min(1),
  cues: z.array(cueSchema).min(1).max(6),
});

/** 讲解脚本（大模型输出）：标题、选用的风格与镜头列表 */
export const scriptSchema = z.object({
  title: z.string().min(1),
  styleId: z.number().int().nullable().optional(),
  styleReason: z.string().optional(),
  shots: z.array(shotSchema).min(3).max(16),
});

export type Cue = z.infer<typeof cueSchema>;
export type Shot = z.infer<typeof shotSchema>;
export type Script = z.infer<typeof scriptSchema>;

export const FPS = 30;

/** 一条字幕停留的帧数：有旁白按语音时长，否则按中文阅读速度（英文同屏，留一点余量） */
export function cueFrames(cue: Cue, readingSpeed: number, narrationSec?: number) {
  if (narrationSec != null) return Math.round(Math.max(narrationSec + 0.35, 1.5) * FPS);
  const zhChars = cue.zh.replace(/\s/g, "").length;
  const enWords = cue.en.split(/\s+/).filter(Boolean).length;
  const seconds = Math.max(zhChars / readingSpeed, enWords / 3.2) + 0.8;
  return Math.round(Math.min(Math.max(seconds, 2.5), 12) * FPS);
}

/** 交给渲染的镜头：js 为编译后的动画代码（为空或出错时显示简单画面），narration 为每条字幕的语音 */
export type RenderShot = {
  heading: string;
  cues: Cue[];
  js: string | null;
  narration: { url: string; sec: number }[] | null;
};

/** 镜头之间的转场时长（帧），转场期间前后镜头重叠 */
export const TRANSITION = 15;
/** 镜头开头留给入场动画的帧数 */
export const LEAD = 12;

export interface TimedShot {
  shot: RenderShot;
  from: number;
  frames: number;
  cueFrames: number[];
  /** 每条字幕开始的帧（相对镜头开头） */
  cueStarts: number[];
}

export function timeline(shots: RenderShot[], readingSpeed: number): { shots: TimedShot[]; total: number } {
  let from = 0;
  const out: TimedShot[] = [];
  for (const shot of shots) {
    const cf = shot.cues.map((c, i) => cueFrames(c, readingSpeed, shot.narration?.[i]?.sec));
    const cueStarts = cf.map((_, k) => LEAD + cf.slice(0, k).reduce((a, b) => a + b, 0));
    const frames = LEAD + cf.reduce((a, b) => a + b, 0) + TRANSITION;
    out.push({ shot, from, frames, cueFrames: cf, cueStarts });
    from += frames - TRANSITION;
  }
  return { shots: out, total: Math.max(from + TRANSITION, 1) };
}

export type ExplainerProps = {
  shots: RenderShot[];
  style: StyleTokens;
  /** 原图标签 → 可访问的 URL */
  figures: Record<string, string>;
  musicUrl: string | null;
  musicVolume: number;
  readingSpeed: number;
  meta: { arxivId: string; paperTitle: string; date: string };
};

/** 镜头动画代码收到的参数（写代码的提示词里会说明） */
export type ShotProps = {
  /** 内容区宽高（像素） */
  width: number;
  height: number;
  /** 本镜头总帧数 */
  durationInFrames: number;
  /** 每条字幕开始的帧，画面元素可据此与字幕同步出现 */
  cueStarts: number[];
  /** 原图标签 → 图片地址 */
  figures: Record<string, string>;
  style: StyleTokens;
};
