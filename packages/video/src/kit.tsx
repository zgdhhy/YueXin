import { createContext, useContext } from "react";
import katex from "katex";
import "katex/dist/katex.min.css";
import { AbsoluteFill, Img, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { DEFAULT_TOKENS, type StyleTokens } from "./theme";

/**
 * 镜头动画代码可用的组件与工具（代码里写 import { ... } from "@kit"）。
 * 它们从当前视频风格取颜色和字体，模型写代码时不需要关心具体配色。
 */
export const StyleContext = createContext<StyleTokens>(DEFAULT_TOKENS);
export const FiguresContext = createContext<Record<string, string>>({});

export function useStyle() {
  return useContext(StyleContext);
}

/** 以 delay 帧为起点的弹性入场进度 0→1 */
export function useEnter(delay = 0, damping = 18) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return spring({ frame: frame - delay, fps, config: { damping, mass: 0.8 } });
}

/** 第 i 个（共 n 个）元素出现的帧：均匀分配到各条字幕的开头 */
export function revealAt(i: number, n: number, cueStarts: number[]) {
  if (!cueStarts.length) return i * 10;
  const k = Math.min(cueStarts.length - 1, Math.floor((i * cueStarts.length) / Math.max(n, 1)));
  return cueStarts[k] + ((i * cueStarts.length) % Math.max(n, 1)) * 6;
}

export function FadeIn({ delay = 0, from = "up", children, style }: { delay?: number; from?: "up" | "left" | "right" | "none"; children: React.ReactNode; style?: React.CSSProperties }) {
  const p = useEnter(delay);
  const d = interpolate(p, [0, 1], [40, 0]);
  const transform = from === "up" ? `translateY(${d}px)` : from === "left" ? `translateX(${-d}px)` : from === "right" ? `translateX(${d}px)` : undefined;
  return <div style={{ opacity: p, transform, ...style }}>{children}</div>;
}

/** 镜头标题：左侧强调竖条 + 大字 */
export function Title({ children, delay = 0, size = 56 }: { children: React.ReactNode; delay?: number; size?: number }) {
  const s = useStyle();
  const p = useEnter(delay);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 20, marginBottom: 36, opacity: p }}>
      <div style={{ width: 10, height: interpolate(p, [0, 1], [0, size]), borderRadius: 5, background: s.colors.primary }} />
      <div style={{ fontSize: size, fontWeight: 700, color: s.colors.text, fontFamily: s.fonts.heading }}>{children}</div>
    </div>
  );
}

export function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  const s = useStyle();
  return <div style={{ background: s.colors.surface, border: `1px solid ${s.colors.border}`, borderRadius: 24, padding: "28px 36px", ...style }}>{children}</div>;
}

/** 论文原图（按标签引用，如 "Figure 2"）；zoom 为整个镜头内缓慢放大的倍数 */
export function Figure({ label, delay = 0, zoom = 1.05, style }: { label: string; delay?: number; zoom?: number; style?: React.CSSProperties }) {
  const figures = useContext(FiguresContext);
  const s = useStyle();
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const p = useEnter(delay);
  const src = figures[label] ?? Object.entries(figures).find(([k]) => k.toLowerCase() === label.toLowerCase())?.[1];
  if (!src) return <div style={{ fontSize: 32, color: s.colors.muted, ...style }}>（{label}）</div>;
  return (
    <div style={{ background: "white", borderRadius: 20, padding: 20, display: "flex", overflow: "hidden", opacity: p, boxShadow: "0 24px 60px rgba(0,0,0,0.25)", ...style }}>
      <Img src={src} style={{ width: "100%", height: "100%", objectFit: "contain", transform: `scale(${interpolate(frame, [0, durationInFrames], [1, zoom])})` }} />
    </div>
  );
}

/** KaTeX 公式 */
export function Formula({ latex, size = 60, style }: { latex: string; size?: number; style?: React.CSSProperties }) {
  const s = useStyle();
  let html = latex;
  try {
    html = katex.renderToString(latex, { displayMode: true, throwOnError: false });
  } catch {
    // 保留原文
  }
  return <div style={{ fontSize: size, color: s.colors.text, textAlign: "center", ...style }} dangerouslySetInnerHTML={{ __html: html }} />;
}

/** 逐渐画出的 SVG 路径（箭头、连线、手绘圈注） */
export function DrawPath({ d, delay = 0, duration = 24, stroke, width = 5, viewBox, style }: { d: string; delay?: number; duration?: number; stroke?: string; width?: number; viewBox: string; style?: React.CSSProperties }) {
  const s = useStyle();
  const frame = useCurrentFrame();
  const p = interpolate(frame, [delay, delay + duration], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <svg viewBox={viewBox} style={{ overflow: "visible", ...style }}>
      <path d={d} pathLength={1} strokeDasharray={1} strokeDashoffset={1 - p} stroke={stroke ?? s.colors.primary} strokeWidth={width} fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** 数字从 from 滚动到 to */
export function Counter({ to, from = 0, delay = 0, duration = 30, decimals = 0, suffix = "", style }: { to: number; from?: number; delay?: number; duration?: number; decimals?: number; suffix?: string; style?: React.CSSProperties }) {
  const s = useStyle();
  const frame = useCurrentFrame();
  const v = interpolate(frame, [delay, delay + duration], [from, to], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return <span style={{ fontVariantNumeric: "tabular-nums", color: s.colors.text, ...style }}>{v.toFixed(decimals)}{suffix}</span>;
}

/** 柱状图：数字必须来自论文 */
export function BarChart({ bars, unit = "", delay = 0, height = 420 }: { bars: { label: string; value: number; highlight?: boolean }[]; unit?: string; delay?: number; height?: number }) {
  const s = useStyle();
  const frame = useCurrentFrame();
  const max = Math.max(...bars.map((b) => b.value), 1e-9);
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 40, height, padding: "0 20px" }}>
      {bars.map((b, i) => {
        const p = interpolate(frame, [delay + i * 6, delay + i * 6 + 24], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
        const color = b.highlight ? s.colors.accent : s.colors.primary;
        return (
          <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", height: "100%", gap: 12 }}>
            <div style={{ fontSize: 30, fontWeight: 700, color, opacity: p }}>{(b.value * p).toFixed(b.value % 1 ? 1 : 0)}{unit}</div>
            <div style={{ width: "70%", height: `${(b.value / max) * 75 * p}%`, background: color, borderRadius: "10px 10px 0 0", opacity: b.highlight ? 1 : 0.75 }} />
            <div style={{ fontSize: 26, color: s.colors.muted, textAlign: "center" }}>{b.label}</div>
          </div>
        );
      })}
    </div>
  );
}

/** 高亮框：在内容区坐标 (x, y, w, h) 处画出强调框，常用于圈出原图局部 */
export function Highlight({ x, y, w, h, delay = 0, color }: { x: number; y: number; w: number; h: number; delay?: number; color?: string }) {
  const s = useStyle();
  const p = useEnter(delay, 14);
  return <div style={{ position: "absolute", left: x, top: y, width: w, height: h, border: `5px solid ${color ?? s.colors.accent}`, borderRadius: 14, opacity: p, transform: `scale(${interpolate(p, [0, 1], [1.15, 1])})` }} />;
}

/** 镜头代码无法渲染时的简单画面：标题 + 文案 */
export function FallbackShot({ heading, lines }: { heading: string; lines: string[] }) {
  const s = useStyle();
  return (
    <AbsoluteFill style={{ justifyContent: "center", padding: "0 60px" }}>
      <Title>{heading}</Title>
      {lines.map((l, i) => (
        <FadeIn key={i} delay={10 + i * 8}>
          <div style={{ fontSize: 38, lineHeight: 1.6, color: s.colors.muted, marginBottom: 12 }}>{l}</div>
        </FadeIn>
      ))}
    </AbsoluteFill>
  );
}
