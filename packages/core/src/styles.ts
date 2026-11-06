import { asc, eq } from "drizzle-orm";
import { DEFAULT_TOKENS, HAND, SANS, SERIF, type StyleTokens } from "@paper/video/theme";
import { db, schema } from "./db";
import { getSetting } from "./settings";

/**
 * 视频风格库：每个风格 = 交给渲染框架的 tokens + 交给大模型的风格说明（guide）。
 * 内置风格（slug 非空）借鉴了 HyperFrames 的「风格描述 + 配色 + 字体 + 禁忌」写法、
 * claude-code-video-toolkit 的按用途命名配色，以及 Paper2Video 的学术幻灯片版式。
 */
export type VideoStyle = typeof schema.videoStyles.$inferSelect;
export type { StyleTokens };

type Builtin = Pick<VideoStyle, "name" | "description" | "guide"> & { slug: string; tokens: StyleTokens };

const BUILTIN_STYLES: Builtin[] = [
  {
    slug: "tech",
    name: "深色科技",
    description: "通用。适合大多数模型、系统与方法类论文",
    tokens: DEFAULT_TOKENS,
    guide: `风格：深色科技感，渐变光斑背景，半透明卡片。
画面：信息用卡片分组，关键词用强调色；流程用横向步骤卡片和箭头；数据用柱状图和数字滚动。
节奏：中速，一个镜头讲清一件事，元素随字幕逐个出现。
禁忌：不要满屏文字；一屏最多 4 个要点；不要花哨的旋转、闪烁。`,
  },
  {
    slug: "slides",
    name: "学术幻灯片",
    description: "适合方法图、实验表格多，需要对着原图讲解的论文",
    tokens: {
      colors: { bg: "#ffffff", bg2: "#f4f7fb", surface: "#f4f7fb", border: "#d8e0ea", text: "#1f2937", muted: "#5b6575", primary: "#1f4e79", accent: "#e67e22" },
      fonts: { heading: SANS, body: SANS },
      background: "plain",
      transition: "slide",
      subtitle: "light",
    },
    guide: `风格：干净的白底学术幻灯片，像一场讲得很好的组会报告。
画面：以论文原图为主角（用 Figure 组件），旁边或下方配不超过 3 条要点；用 Highlight 高亮框依次圈出原图里正在讲的部分；标题栏简洁。
节奏：中速，跟着字幕依次高亮，镜头之间横向滑动切换。
禁忌：不要深色背景和光效；不要装饰性动画；不要把原图缩得太小（至少占内容区一半）。`,
  },
  {
    slug: "math",
    name: "数学动画",
    description: "适合理论推导、公式、几何直觉多的论文（3Blue1Brown 风格）",
    tokens: {
      colors: { bg: "#1c1c1c", bg2: "#1c1c1c", surface: "rgba(255,255,255,0.04)", border: "rgba(255,255,255,0.15)", text: "#f5f5f5", muted: "#a3a3a3", primary: "#58c4dd", accent: "#ffd166" },
      fonts: { heading: SERIF, body: SANS },
      background: "plain",
      transition: "fade",
      subtitle: "dark",
    },
    guide: `风格：3Blue1Brown 式数学动画，纯深色背景，大量留白，一屏只讲一个概念。
画面：用 DrawPath 一笔一笔画出坐标轴、向量、曲线、示意图；公式用 Formula 逐步出现，变化的部分用强调色；先给几何直觉，再给式子。
节奏：慢，重要的地方停一停；动画平滑（spring 阻尼大一些）。
禁忌：不要卡片堆叠和要点列表；不要柱状图以外的花哨图表；不要同时出现两个以上公式。`,
  },
  {
    slug: "news",
    name: "科技快讯",
    description: "适合结论鲜明、数字亮眼、需要快速抓住重点的论文",
    tokens: {
      colors: { bg: "#0a0a0f", bg2: "#1b0b2e", surface: "rgba(255,255,255,0.07)", border: "rgba(255,255,255,0.18)", text: "#ffffff", muted: "#b4b4c8", primary: "#ff3d71", accent: "#00e0ff" },
      fonts: { heading: SANS, body: SANS },
      background: "grid",
      transition: "slide",
      subtitle: "dark",
    },
    guide: `风格：科技新闻快讯，强对比配色，粗体大字，信息密度高但每屏只有一个结论。
画面：结论先行，用超大字号（90px 以上）打出核心数字或结论，用 Counter 数字滚动、BarChart 对比；关键词用强调色块标出。
节奏：快，镜头短，元素干脆地弹入（spring 阻尼小一些）。
禁忌：不要长段文字；不要慢吞吞的淡入；不要冷色调的平淡卡片。`,
  },
  {
    slug: "whiteboard",
    name: "白板手绘",
    description: "适合需要从零讲清直觉、概念之间关系较多的论文",
    tokens: {
      colors: { bg: "#faf7f0", bg2: "#faf7f0", surface: "rgba(255,255,255,0.7)", border: "#d6d0c4", text: "#222222", muted: "#555555", primary: "#1e40af", accent: "#dc2626" },
      fonts: { heading: HAND, body: HAND },
      background: "paper",
      transition: "fade",
      subtitle: "light",
    },
    guide: `风格：老师在白板上边画边讲，米白纸面，马克笔线条。
画面：用 DrawPath 手绘方框、箭头、圈注和简笔示意图，把概念之间的关系画出来；文字像板书一样简短；重点用红色圈出。
节奏：中速，线条一段段画出来，跟着字幕推进。
禁忌：不要渐变、阴影和发光；不要照片感的元素；不要整齐的表格式排版。`,
  },
];

/** 补齐内置风格（不覆盖用户的修改） */
export function ensureStyles() {
  const existing = new Set(db.select({ slug: schema.videoStyles.slug }).from(schema.videoStyles).all().map((s) => s.slug));
  for (const b of BUILTIN_STYLES) if (!existing.has(b.slug)) db.insert(schema.videoStyles).values(b).run();
}

export function listStyles(): VideoStyle[] {
  return db.select().from(schema.videoStyles).orderBy(asc(schema.videoStyles.id)).all();
}

export function getStyle(id: number | null | undefined): VideoStyle | undefined {
  return id == null ? undefined : db.select().from(schema.videoStyles).where(eq(schema.videoStyles.id, id)).get();
}

/** 默认风格：深色科技；被删时取第一个启用的 */
export function defaultStyle(): VideoStyle {
  const all = listStyles();
  return all.find((s) => s.slug === "tech") ?? all.find((s) => s.enabled) ?? all[0];
}

/** 本次视频可选的风格：指定的 > 设置里固定的 > 启用的全部（交给大模型挑） */
export function styleChoices(override?: number): { fixed: VideoStyle | null; options: VideoStyle[] } {
  const forced = getStyle(override);
  if (forced) return { fixed: forced, options: [forced] };
  const video = getSetting("video");
  const fixed = video.styleMode === "fixed" ? getStyle(video.styleId) : undefined;
  if (fixed) return { fixed, options: [fixed] };
  const options = listStyles().filter((s) => s.enabled);
  return options.length > 1 ? { fixed: null, options } : { fixed: options[0] ?? defaultStyle(), options: [options[0] ?? defaultStyle()] };
}

/** 上传的参考视频存放位置（相对 DATA_DIR），分析完即删除 */
export const REFERENCE_DIR = "styles/references";

export type StyleInput = Pick<VideoStyle, "name" | "description" | "guide" | "tokens">;

/** 新建或修改风格；内置风格也可以改，改坏了可以从内置复制一份重来 */
export function saveStyle(input: StyleInput, id?: number) {
  const values = { name: input.name.trim().slice(0, 30) || "未命名风格", description: input.description.trim().slice(0, 200), guide: input.guide.trim().slice(0, 4000), tokens: input.tokens };
  if (id) {
    db.update(schema.videoStyles).set(values).where(eq(schema.videoStyles.id, id)).run();
    return id;
  }
  return db.insert(schema.videoStyles).values(values).returning({ id: schema.videoStyles.id }).get().id;
}

export function setStyleEnabled(id: number, enabled: boolean) {
  db.update(schema.videoStyles).set({ enabled }).where(eq(schema.videoStyles.id, id)).run();
}

/** 删除自建风格；内置风格只能停用 */
export function deleteStyle(id: number) {
  const s = getStyle(id);
  if (!s) return;
  if (s.slug) throw new Error("内置风格不能删除，可以停用");
  db.delete(schema.videoStyles).where(eq(schema.videoStyles.id, id)).run();
}
