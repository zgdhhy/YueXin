import { z } from "zod";

/** 一条双语字幕；视频节奏完全由字幕阅读时长驱动（没有配音） */
export const cueSchema = z.object({
  zh: z.string().min(1),
  en: z.string().min(1),
});

const base = { cues: z.array(cueSchema).min(1).max(6) };

export const sceneSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("title"), title: z.string(), subtitle: z.string(), ...base }),
  z.object({ type: z.literal("section"), index: z.number().int(), title: z.string(), ...base }),
  z.object({ type: z.literal("bullets"), heading: z.string(), items: z.array(z.string()).min(1).max(5), ...base }),
  z.object({ type: z.literal("figure"), heading: z.string(), figure: z.string(), ...base }),
  z.object({
    type: z.literal("flow"),
    heading: z.string(),
    steps: z.array(z.object({ label: z.string(), detail: z.string().optional() })).min(2).max(5),
    ...base,
  }),
  z.object({ type: z.literal("formula"), heading: z.string(), latex: z.string(), explanation: z.string(), ...base }),
  z.object({
    type: z.literal("compare"),
    heading: z.string(),
    left: z.object({ label: z.string(), points: z.array(z.string()).min(1).max(4) }),
    right: z.object({ label: z.string(), points: z.array(z.string()).min(1).max(4) }),
    ...base,
  }),
  z.object({
    type: z.literal("bars"),
    heading: z.string(),
    unit: z.string().optional(),
    bars: z.array(z.object({ label: z.string(), value: z.number(), highlight: z.boolean().optional() })).min(2).max(8),
    ...base,
  }),
  z.object({ type: z.literal("outro"), title: z.string(), points: z.array(z.string()).max(4), ...base }),
]);

export const storyboardSchema = z.object({ scenes: z.array(sceneSchema).min(4).max(40) });

export type Cue = z.infer<typeof cueSchema>;
export type Scene = z.infer<typeof sceneSchema>;
export type Storyboard = z.infer<typeof storyboardSchema>;

export const FPS = 30;

/** 一条字幕停留的时长（帧）：按中文阅读速度计算，英文字幕同屏显示，额外留一点余量 */
export function cueFrames(cue: Cue, readingSpeed: number) {
  const zhChars = cue.zh.replace(/\s/g, "").length;
  const enWords = cue.en.split(/\s+/).filter(Boolean).length;
  const seconds = Math.max(zhChars / readingSpeed, enWords / 3.2) + 0.8;
  return Math.round(Math.min(Math.max(seconds, 2.5), 12) * FPS);
}

export interface TimedScene {
  scene: Scene;
  from: number;
  frames: number;
  cueFrames: number[];
}

/** 场景之间的转场时长（帧），转场期间前后场景重叠 */
export const TRANSITION = 15;

export function timeline(scenes: Scene[], readingSpeed: number): { scenes: TimedScene[]; total: number } {
  let from = 0;
  const out: TimedScene[] = [];
  for (const scene of scenes) {
    // 场景开头留出入场动画时间
    const lead = scene.type === "title" ? 20 : 12;
    const cf = scene.cues.map((c) => cueFrames(c, readingSpeed));
    const frames = lead + cf.reduce((a, b) => a + b, 0) + TRANSITION;
    out.push({ scene, from, frames, cueFrames: cf });
    from += frames - TRANSITION;
  }
  return { scenes: out, total: from + TRANSITION };
}

export type ExplainerProps = {
  storyboard: Storyboard;
  /** 原图标签 → 可访问的 URL */
  figures: Record<string, string>;
  musicUrl: string | null;
  musicVolume: number;
  readingSpeed: number;
  meta: { arxivId: string; paperTitle: string; date: string };
};
