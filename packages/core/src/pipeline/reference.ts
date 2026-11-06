import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { analyzeReference } from "@paper/video/reference";
import { HAND, SANS, SERIF, type StyleTokens } from "@paper/video/theme";
import { dataPath } from "../env";
import { generateJson, llmForStage } from "../llm";
import { STYLE_ANALYSIS_SYSTEM, styleAnalysisPrompt } from "../prompts/assistant";
import { REFERENCE_DIR, saveStyle, setStyleEnabled } from "../styles";
import type { Log } from "./select";
import { makeStyleSample } from "./video";

/**
 * 参考视频 → 视频风格：抽关键帧与剪辑节奏，交给「对话」环节的模型（需要能看图）写出风格草稿，
 * 保存为一个停用的风格并渲染样片，由用户确认后启用。参考视频分析完即删除。
 */
const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const draftSchema = z.object({
  name: z.string().min(1),
  description: z.string(),
  guide: z.string().min(1),
  colors: z.object({ bg: hex, bg2: hex, surface: hex, border: hex, text: hex, muted: hex, primary: hex, accent: hex }),
  font: z.enum(["sans", "serif", "hand"]),
  background: z.enum(["aurora", "grid", "plain", "paper"]),
  transition: z.enum(["fade", "slide", "cut"]),
  subtitle: z.enum(["dark", "light"]),
});
export type StyleDraft = z.infer<typeof draftSchema>;

const FONTS = { sans: SANS, serif: SERIF, hand: HAND };

function draftTokens(d: StyleDraft): StyleTokens {
  const font = FONTS[d.font];
  return { colors: d.colors, fonts: { heading: font, body: font }, background: d.background, transition: d.transition, subtitle: d.subtitle };
}

export async function styleFromReference(referencePath: string, log: Log): Promise<number> {
  const file = dataPath(referencePath);
  if (!path.resolve(file).startsWith(path.resolve(dataPath(REFERENCE_DIR))) || !fs.existsSync(file)) throw new Error("参考视频不存在");
  const work = `${file}.frames`;
  try {
    const a = await analyzeReference(file, work);
    log(`参考视频 ${a.durationSec.toFixed(0)} 秒，${a.width}×${a.height}，${a.cuts.length} 次剪辑（平均每镜 ${a.avgShotSec.toFixed(1)} 秒），抽取关键帧 ${a.frames.length} 张`);
    const llm = llmForStage("chat");
    log(`分析画面风格中（${llm.label}，需要模型支持看图）…`);
    let draft: StyleDraft;
    try {
      draft = await generateJson(
        llm,
        {
          system: STYLE_ANALYSIS_SYSTEM,
          prompt: styleAnalysisPrompt({ ...a, cuts: a.cuts.length, frames: a.frames.length }),
          images: a.frames.map((f) => ({ mediaType: "image/jpeg" as const, data: fs.readFileSync(f).toString("base64") })),
        },
        draftSchema,
      );
    } catch (e) {
      throw new Error(`风格分析失败（「对话」环节的模型需要支持图片输入）：${e instanceof Error ? e.message : String(e)}`);
    }
    const id = saveStyle({ name: draft.name, description: draft.description, guide: draft.guide, tokens: draftTokens(draft) });
    // 新风格先停用：看过样片再启用，避免自动选风格时被选中
    setStyleEnabled(id, false);
    log(`已生成风格「${draft.name}」（停用中，确认样片后可在风格库启用）`);
    await makeStyleSample(id, log);
    return id;
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
    fs.rmSync(file, { force: true });
  }
}
