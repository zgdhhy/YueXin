/** 画布与布局常量：顶部标题栏、底部字幕区由框架绘制，镜头只画中间的内容区 */
export const WIDTH = 1920;
export const HEIGHT = 1080;
export const HEADER_H = 90;
export const SUBTITLE_H = 230;
/** 镜头内容区（相对画布） */
export const CONTENT = { left: 100, top: HEADER_H, width: WIDTH - 200, height: HEIGHT - HEADER_H - SUBTITLE_H };

/**
 * 风格令牌：视频风格里交给渲染框架的部分（配色、字体、背景、转场、字幕）。
 * 风格的叙事口吻与禁忌清单是文字，交给写脚本、写代码的大模型，不在这里。
 */
export type StyleTokens = {
  colors: {
    /** 背景主色与渐变色 */
    bg: string;
    bg2: string;
    /** 卡片等表面 */
    surface: string;
    border: string;
    text: string;
    muted: string;
    /** 主强调色与辅助强调色 */
    primary: string;
    accent: string;
  };
  fonts: { heading: string; body: string };
  background: "aurora" | "grid" | "plain" | "paper";
  transition: "fade" | "slide" | "cut";
  /** 字幕底：深色底配浅字，浅色底配深字 */
  subtitle: "dark" | "light";
};

const CJK = '"Noto Sans CJK SC", "Noto Sans SC", "Source Han Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif';
export const SERIF = '"Noto Serif CJK SC", "Source Han Serif SC", "Songti SC", "SimSun", serif';
export const HAND = '"Xiaolai SC", "LXGW WenKai", "KaiTi", "STKaiti", cursive';
export const SANS = CJK;

/** 深色科技：最初的默认风格 */
export const DEFAULT_TOKENS: StyleTokens = {
  colors: { bg: "#0b1020", bg2: "#141c3a", surface: "rgba(255,255,255,0.06)", border: "rgba(255,255,255,0.12)", text: "#f1f5f9", muted: "#94a3b8", primary: "#818cf8", accent: "#22d3ee" },
  fonts: { heading: CJK, body: CJK },
  background: "aurora",
  transition: "fade",
  subtitle: "dark",
};
