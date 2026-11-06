import { AbsoluteFill, Audio, interpolate, Sequence, useCurrentFrame, useVideoConfig } from "remotion";
import { FiguresContext, StyleContext } from "./kit";
import { ShotView } from "./runtime";
import { LEAD, timeline, TRANSITION, type Cue, type ExplainerProps } from "./script";
import { CONTENT, HEADER_H, SUBTITLE_H, type StyleTokens } from "./theme";

/** 框架绘制的背景，随风格变化 */
function Background({ style }: { style: StyleTokens }) {
  const frame = useCurrentFrame();
  const { bg, bg2, primary, accent } = style.colors;
  const base = <AbsoluteFill style={{ background: `linear-gradient(135deg, ${bg}, ${bg2})` }} />;
  if (style.background === "plain") return base;
  if (style.background === "paper") {
    return (
      <AbsoluteFill style={{ background: bg }}>
        <AbsoluteFill style={{ backgroundImage: `radial-gradient(${style.colors.border} 1.2px, transparent 1.2px)`, backgroundSize: "28px 28px", opacity: 0.6 }} />
      </AbsoluteFill>
    );
  }
  const grid = (
    <AbsoluteFill
      style={{
        backgroundImage: `linear-gradient(${style.colors.border} 1px, transparent 1px), linear-gradient(90deg, ${style.colors.border} 1px, transparent 1px)`,
        backgroundSize: "64px 64px",
        backgroundPosition: `0 ${(-frame * 0.3) % 64}px`,
        opacity: 0.35,
      }}
    />
  );
  if (style.background === "grid") return <AbsoluteFill>{base}{grid}</AbsoluteFill>;
  const t = frame / 30;
  const blob = (x: number, y: number, color: string, size: number, speed: number, phase: number) => (
    <div style={{ position: "absolute", left: x + Math.sin(t * speed + phase) * 120, top: y + Math.cos(t * speed * 0.8 + phase) * 80, width: size, height: size, borderRadius: "50%", background: color, filter: "blur(120px)", opacity: 0.3 }} />
  );
  return (
    <AbsoluteFill style={{ overflow: "hidden" }}>
      {base}
      {blob(-100, -150, primary, 700, 0.15, 0)}
      {blob(1300, 500, accent, 650, 0.12, 2)}
      {grid}
    </AbsoluteFill>
  );
}

/** 镜头整体转场：淡入淡出、横向滑入或硬切 */
function ShotFrame({ frames, kind, children }: { frames: number; kind: StyleTokens["transition"]; children: React.ReactNode }) {
  const frame = useCurrentFrame();
  if (kind === "cut") return <AbsoluteFill>{children}</AbsoluteFill>;
  const opacity = interpolate(frame, [0, TRANSITION, frames - TRANSITION, frames], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const x = kind === "slide" ? interpolate(frame, [0, TRANSITION], [80, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) : 0;
  return <AbsoluteFill style={{ opacity, transform: x ? `translateX(${x}px)` : undefined }}>{children}</AbsoluteFill>;
}

/** 底部双语字幕：按每条字幕的时长依次切换 */
function Subtitles({ cues, cueFrames, style }: { cues: Cue[]; cueFrames: number[]; style: StyleTokens }) {
  const frame = useCurrentFrame() - LEAD;
  if (frame < 0) return null;
  let start = 0;
  let idx = 0;
  while (idx < cues.length - 1 && frame >= start + cueFrames[idx]) {
    start += cueFrames[idx];
    idx++;
  }
  const local = frame - start;
  const len = cueFrames[idx];
  const opacity = interpolate(local, [0, 8, len - 6, len], [0, 1, 1, idx === cues.length - 1 ? 1 : 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const dark = style.subtitle === "dark";
  return (
    <div
      style={{
        position: "absolute", left: 0, right: 0, bottom: 0, height: SUBTITLE_H, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, padding: "0 160px", opacity,
        background: dark ? "linear-gradient(to top, rgba(5,8,20,0.92), rgba(5,8,20,0.55) 70%, transparent)" : "linear-gradient(to top, rgba(255,255,255,0.95), rgba(255,255,255,0.7) 70%, transparent)",
      }}
    >
      <div style={{ fontSize: 46, fontWeight: 600, color: dark ? "#f8fafc" : "#1f2937", textAlign: "center", lineHeight: 1.35, fontFamily: style.fonts.body }}>{cues[idx].zh}</div>
      <div style={{ fontSize: 28, color: dark ? "#cbd5e1" : "#4b5563", textAlign: "center", lineHeight: 1.35, fontFamily: "Inter, Segoe UI, Helvetica, Arial, sans-serif" }}>{cues[idx].en}</div>
    </div>
  );
}

function Header({ meta, style }: { meta: ExplainerProps["meta"]; style: StyleTokens }) {
  return (
    <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: HEADER_H, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 60px", fontSize: 24, color: style.colors.muted }}>
      <span style={{ color: style.colors.primary, fontWeight: 700, letterSpacing: 2, fontFamily: style.fonts.heading }}>AI 前沿论文精读</span>
      {meta.arxivId && <span style={{ fontFamily: "Inter, Segoe UI, sans-serif" }}>arXiv:{meta.arxivId}</span>}
    </div>
  );
}

function Progress({ color }: { color: string }) {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  return <div style={{ position: "absolute", left: 0, bottom: 0, height: 6, width: `${(frame / durationInFrames) * 100}%`, background: color }} />;
}

/** 讲解视频：框架负责背景、标题栏、字幕、旁白、音乐与转场，镜头画面由各自的动画代码绘制 */
export function Explainer(props: ExplainerProps) {
  const { shots, total } = timeline(props.shots, props.readingSpeed);
  const { fps } = useVideoConfig();
  const style = props.style;
  return (
    <StyleContext.Provider value={style}>
      <FiguresContext.Provider value={props.figures}>
        <AbsoluteFill style={{ fontFamily: style.fonts.body, color: style.colors.text }}>
          <Background style={style} />
          {props.musicUrl && (
            <Audio
              src={props.musicUrl}
              loop
              // 有旁白时音乐压低
              volume={(f) => props.musicVolume * (props.shots.some((s) => s.narration) ? 0.4 : 1) * interpolate(f, [0, fps * 2, total - fps * 3, total], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })}
            />
          )}
          <Header meta={props.meta} style={style} />
          {shots.map((t, i) => (
            <Sequence key={i} from={t.from} durationInFrames={t.frames}>
              <ShotFrame frames={t.frames} kind={style.transition}>
                <div style={{ position: "absolute", left: CONTENT.left, top: CONTENT.top, width: CONTENT.width, height: CONTENT.height }}>
                  <ShotView
                    index={i}
                    js={t.shot.js}
                    heading={t.shot.heading}
                    lines={t.shot.cues.map((c) => c.zh)}
                    props={{ width: CONTENT.width, height: CONTENT.height, durationInFrames: t.frames, cueStarts: t.cueStarts, figures: props.figures, style }}
                  />
                </div>
                <Subtitles cues={t.shot.cues} cueFrames={t.cueFrames} style={style} />
              </ShotFrame>
              {t.shot.narration?.map((n, k) => (
                <Sequence key={k} from={t.cueStarts[k]} durationInFrames={t.cueFrames[k]}>
                  <Audio src={n.url} />
                </Sequence>
              ))}
            </Sequence>
          ))}
          <Progress color={style.colors.primary} />
        </AbsoluteFill>
      </FiguresContext.Provider>
    </StyleContext.Provider>
  );
}
