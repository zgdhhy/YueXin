import katex from "katex";
import "katex/dist/katex.min.css";
import { Img, interpolate, useCurrentFrame } from "remotion";
import type { Scene } from "../storyboard";
import { FadeUp, GlassCard, Heading, useEnter } from "../ui";
import { theme } from "../theme";

export interface SceneProps<T extends Scene["type"]> {
  scene: Extract<Scene, { type: T }>;
  /** 每条字幕开始的帧（相对场景开头），用来让画面元素与字幕同步出现 */
  cueStarts: number[];
  frames: number;
  figures: Record<string, string>;
  meta: { arxivId: string; paperTitle: string; date: string };
}

/** 第 i 个（共 n 个）元素出现的帧：均匀分配到各条字幕的开头 */
function revealAt(i: number, n: number, cueStarts: number[]) {
  const k = Math.min(cueStarts.length - 1, Math.floor((i * cueStarts.length) / n));
  return cueStarts[k] + (i * cueStarts.length) % n * 6;
}

const content: React.CSSProperties = { position: "absolute", left: 140, right: 140, top: 140, bottom: 260 };

export function TitleScene({ scene, meta }: SceneProps<"title">) {
  const p = useEnter(0, 22);
  return (
    <div style={{ ...content, display: "flex", flexDirection: "column", justifyContent: "center" }}>
      <FadeUp>
        <div style={{ fontSize: 30, color: theme.accent2, letterSpacing: 6, marginBottom: 28 }}>AI 前沿论文精读 · {meta.date}</div>
      </FadeUp>
      <div
        style={{
          fontSize: 92,
          fontWeight: 800,
          lineHeight: 1.2,
          color: theme.text,
          opacity: p,
          transform: `scale(${interpolate(p, [0, 1], [0.92, 1])})`,
          transformOrigin: "left center",
        }}
      >
        {scene.title}
      </div>
      <FadeUp delay={10}>
        <div style={{ fontSize: 40, color: theme.muted, marginTop: 30, lineHeight: 1.5 }}>{scene.subtitle}</div>
      </FadeUp>
      <FadeUp delay={20}>
        <div style={{ marginTop: 50, fontSize: 26, color: "rgba(148,163,184,0.8)", fontFamily: "Inter, Segoe UI, sans-serif" }}>
          {meta.paperTitle} · arXiv:{meta.arxivId}
        </div>
      </FadeUp>
    </div>
  );
}

export function SectionScene({ scene }: SceneProps<"section">) {
  const p = useEnter(0, 20);
  return (
    <div style={{ ...content, display: "flex", alignItems: "center", gap: 60 }}>
      <div
        style={{
          fontSize: 260,
          fontWeight: 900,
          lineHeight: 1,
          background: `linear-gradient(135deg, ${theme.accent}, ${theme.accent2})`,
          WebkitBackgroundClip: "text",
          color: "transparent",
          opacity: p,
          transform: `translateX(${interpolate(p, [0, 1], [-80, 0])}px)`,
        }}
      >
        {String(scene.index).padStart(2, "0")}
      </div>
      <FadeUp delay={8}>
        <div style={{ fontSize: 88, fontWeight: 800, color: theme.text }}>{scene.title}</div>
      </FadeUp>
    </div>
  );
}

export function BulletsScene({ scene, cueStarts }: SceneProps<"bullets">) {
  const frame = useCurrentFrame();
  return (
    <div style={content}>
      <Heading>{scene.heading}</Heading>
      <div style={{ display: "flex", flexDirection: "column", gap: 26 }}>
        {scene.items.map((item, i) => {
          const at = revealAt(i, scene.items.length, cueStarts);
          const p = interpolate(frame, [at, at + 12], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
          return (
            <GlassCard
              key={i}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 28,
                opacity: p,
                transform: `translateX(${interpolate(p, [0, 1], [60, 0])}px)`,
              }}
            >
              <div
                style={{
                  flexShrink: 0,
                  width: 56,
                  height: 56,
                  borderRadius: 28,
                  background: theme.accent,
                  color: theme.bg1,
                  fontSize: 30,
                  fontWeight: 800,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {i + 1}
              </div>
              <div style={{ fontSize: 40, color: theme.text, lineHeight: 1.4 }}>{item}</div>
            </GlassCard>
          );
        })}
      </div>
    </div>
  );
}

export function FigureScene({ scene, figures, frames }: SceneProps<"figure">) {
  const frame = useCurrentFrame();
  const src = figures[scene.figure];
  const zoom = interpolate(frame, [0, frames], [1, 1.06]);
  const p = useEnter(4);
  return (
    <div style={{ ...content, display: "flex", flexDirection: "column" }}>
      <Heading>{scene.heading}</Heading>
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", minHeight: 0, opacity: p }}>
        {src ? (
          <div
            style={{
              background: "white",
              borderRadius: 20,
              padding: 24,
              boxShadow: "0 30px 80px rgba(0,0,0,0.5)",
              maxHeight: "100%",
              maxWidth: "100%",
              display: "flex",
              overflow: "hidden",
            }}
          >
            <Img
              src={src}
              style={{ maxHeight: 560, maxWidth: 1560, objectFit: "contain", transform: `scale(${zoom})` }}
            />
          </div>
        ) : (
          <div style={{ fontSize: 36, color: theme.muted }}>（{scene.figure}）</div>
        )}
      </div>
    </div>
  );
}

export function FlowScene({ scene, cueStarts }: SceneProps<"flow">) {
  const frame = useCurrentFrame();
  const n = scene.steps.length;
  return (
    <div style={content}>
      <Heading>{scene.heading}</Heading>
      <div style={{ display: "flex", alignItems: "stretch", gap: 0, marginTop: 60 }}>
        {scene.steps.map((s, i) => {
          const at = revealAt(i, n, cueStarts);
          const p = interpolate(frame, [at, at + 14], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
          return (
            <div key={i} style={{ display: "flex", alignItems: "center", flex: 1 }}>
              <GlassCard
                style={{
                  flex: 1,
                  minHeight: 260,
                  opacity: p,
                  transform: `translateY(${interpolate(p, [0, 1], [40, 0])}px)`,
                  borderColor: i === n - 1 ? theme.accent2 : theme.cardBorder,
                }}
              >
                <div style={{ fontSize: 26, color: theme.accent2, marginBottom: 14 }}>STEP {i + 1}</div>
                <div style={{ fontSize: 38, fontWeight: 700, color: theme.text, lineHeight: 1.3 }}>{s.label}</div>
                {s.detail && <div style={{ fontSize: 28, color: theme.muted, marginTop: 16, lineHeight: 1.45 }}>{s.detail}</div>}
              </GlassCard>
              {i < n - 1 && (
                <div style={{ width: 70, display: "flex", justifyContent: "center", opacity: p }}>
                  <svg width="50" height="40" viewBox="0 0 50 40">
                    <path d="M0 20 H38 M26 6 L42 20 L26 34" stroke={theme.accent} strokeWidth="5" fill="none" strokeLinecap="round" />
                  </svg>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function FormulaScene({ scene }: SceneProps<"formula">) {
  let html: string;
  try {
    html = katex.renderToString(scene.latex, { displayMode: true, throwOnError: false });
  } catch {
    html = scene.latex;
  }
  const p = useEnter(6);
  return (
    <div style={{ ...content, display: "flex", flexDirection: "column" }}>
      <Heading>{scene.heading}</Heading>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", gap: 50 }}>
        <GlassCard
          style={{
            fontSize: 64,
            color: theme.text,
            textAlign: "center",
            opacity: p,
            transform: `scale(${interpolate(p, [0, 1], [0.9, 1])})`,
          }}
        >
          <div dangerouslySetInnerHTML={{ __html: html }} />
        </GlassCard>
        <FadeUp delay={20}>
          <div style={{ fontSize: 36, color: theme.muted, textAlign: "center", lineHeight: 1.5 }}>{scene.explanation}</div>
        </FadeUp>
      </div>
    </div>
  );
}

export function CompareScene({ scene, cueStarts }: SceneProps<"compare">) {
  const side = (s: { label: string; points: string[] }, color: string, delayIdx: number) => {
    const at = cueStarts[Math.min(delayIdx, cueStarts.length - 1)];
    return (
      <FadeUp delay={at} style={{ flex: 1 }}>
        <GlassCard style={{ height: "100%", borderTop: `6px solid ${color}` }}>
          <div style={{ fontSize: 42, fontWeight: 800, color, marginBottom: 26 }}>{s.label}</div>
          {s.points.map((pt, i) => (
            <div key={i} style={{ fontSize: 34, color: theme.text, lineHeight: 1.45, marginBottom: 18, display: "flex", gap: 16 }}>
              <span style={{ color }}>●</span>
              <span>{pt}</span>
            </div>
          ))}
        </GlassCard>
      </FadeUp>
    );
  };
  return (
    <div style={{ ...content, display: "flex", flexDirection: "column" }}>
      <Heading>{scene.heading}</Heading>
      <div style={{ flex: 1, display: "flex", gap: 50 }}>
        {side(scene.left, theme.muted, 0)}
        {side(scene.right, theme.accent2, 1)}
      </div>
    </div>
  );
}

export function BarsScene({ scene, cueStarts }: SceneProps<"bars">) {
  const frame = useCurrentFrame();
  const max = Math.max(...scene.bars.map((b) => Math.abs(b.value)), 1e-9);
  const start = cueStarts[0] + 6;
  return (
    <div style={{ ...content, display: "flex", flexDirection: "column" }}>
      <Heading>{scene.heading}</Heading>
      <div style={{ display: "flex", flexDirection: "column", gap: 28, flex: 1, justifyContent: "center", paddingBottom: 40 }}>
        {scene.bars.map((b, i) => {
          const p = interpolate(frame, [start + i * 5, start + i * 5 + 30], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });
          const color = b.highlight ? theme.warm : theme.accent;
          return (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 24 }}>
              <div style={{ width: 380, fontSize: 30, color: theme.text, textAlign: "right" }}>{b.label}</div>
              <div style={{ flex: 1, height: 46, background: "rgba(255,255,255,0.05)", borderRadius: 10 }}>
                <div
                  style={{
                    width: `${(Math.abs(b.value) / max) * 100 * p}%`,
                    height: "100%",
                    borderRadius: 10,
                    background: `linear-gradient(90deg, ${color}aa, ${color})`,
                  }}
                />
              </div>
              <div style={{ width: 200, fontSize: 32, fontWeight: 700, color }}>
                {(b.value * p).toFixed(Number.isInteger(b.value) ? 0 : 1)}
                {scene.unit ?? ""}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function OutroScene({ scene }: SceneProps<"outro">) {
  return (
    <div style={{ ...content, display: "flex", flexDirection: "column", justifyContent: "center" }}>
      <FadeUp>
        <div style={{ fontSize: 76, fontWeight: 800, color: theme.text, marginBottom: 50 }}>{scene.title}</div>
      </FadeUp>
      {scene.points.map((pt, i) => (
        <FadeUp key={i} delay={10 + i * 8}>
          <div style={{ fontSize: 40, color: theme.text, marginBottom: 24, display: "flex", gap: 20 }}>
            <span style={{ color: theme.accent2 }}>→</span>
            {pt}
          </div>
        </FadeUp>
      ))}
      <FadeUp delay={40}>
        <div style={{ marginTop: 50, fontSize: 30, color: theme.muted }}>完整图文解读见网站 · AI 前沿论文精读</div>
      </FadeUp>
    </div>
  );
}
