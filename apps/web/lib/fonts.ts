import { HAND, SANS, SERIF } from "@paper/video/theme";

/** 风格编辑里可选的字体（渲染机器上需装有对应的中文字体） */
export const FONT_KEYS = ["sans", "serif", "hand"] as const;
export type FontKey = (typeof FONT_KEYS)[number];
export const FONT_STACKS: Record<FontKey, string> = { sans: SANS, serif: SERIF, hand: HAND };
export const FONT_NAMES: Record<FontKey, string> = { sans: "黑体", serif: "宋体", hand: "手写" };
export const fontKey = (stack: string): FontKey => FONT_KEYS.find((k) => FONT_STACKS[k] === stack) ?? "sans";
