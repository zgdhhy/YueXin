import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { theme } from "./theme";

/** 缓慢漂移的光斑 + 网格背景 */
export function Background() {
  const frame = useCurrentFrame();
  const t = frame / 30;
  const blob = (x: number, y: number, color: string, size: number, speed: number, phase: number) => (
    <div
      style={{
        position: "absolute",
        left: x + Math.sin(t * speed + phase) * 120,
        top: y + Math.cos(t * speed * 0.8 + phase) * 80,
        width: size,
        height: size,
        borderRadius: "50%",
        background: color,
        filter: "blur(120px)",
        opacity: 0.35,
      }}
    />
  );
  return (
    <AbsoluteFill style={{ background: `linear-gradient(135deg, ${theme.bg1}, ${theme.bg2})`, overflow: "hidden" }}>
      {blob(-100, -150, "#4f46e5", 700, 0.15, 0)}
      {blob(1300, 500, "#0891b2", 650, 0.12, 2)}
      {blob(700, 700, "#7c3aed", 500, 0.1, 4)}
      <AbsoluteFill
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.035) 1px, transparent 1px)",
          backgroundSize: "64px 64px",
          backgroundPosition: `0 ${(-frame * 0.3) % 64}px`,
        }}
      />
    </AbsoluteFill>
  );
}

/** 以 delay 帧为起点的弹性入场进度 0→1 */
export function useEnter(delay = 0, damping = 18) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return spring({ frame: frame - delay, fps, config: { damping, mass: 0.8 } });
}

export function FadeUp({ delay = 0, children, style }: { delay?: number; children: React.ReactNode; style?: React.CSSProperties }) {
  const p = useEnter(delay);
  return (
    <div style={{ opacity: p, transform: `translateY(${interpolate(p, [0, 1], [40, 0])}px)`, ...style }}>{children}</div>
  );
}

export function Heading({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  const p = useEnter(delay);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 20, marginBottom: 40, opacity: p }}>
      <div style={{ width: 10, height: interpolate(p, [0, 1], [0, 56]), borderRadius: 5, background: theme.accent }} />
      <div style={{ fontSize: 56, fontWeight: 700, color: theme.text, letterSpacing: 1 }}>{children}</div>
    </div>
  );
}

export function GlassCard({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div
      style={{
        background: theme.card,
        border: `1px solid ${theme.cardBorder}`,
        borderRadius: 24,
        padding: "28px 36px",
        backdropFilter: "blur(6px)",
        ...style,
      }}
    >
      {children}
    </div>
  );
}
