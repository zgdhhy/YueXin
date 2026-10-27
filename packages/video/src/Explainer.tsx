import { AbsoluteFill, Audio, interpolate, Sequence, useCurrentFrame, useVideoConfig } from "remotion";
import { Background } from "./ui";
import { Subtitles } from "./Subtitles";
import { timeline, TRANSITION, type ExplainerProps, type Scene } from "./storyboard";
import { HEADER_H, theme } from "./theme";
import * as S from "./scenes";

function SceneBody(props: S.SceneProps<Scene["type"]>) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- switch 已按 type 收窄
  const p = props as any;
  switch (props.scene.type) {
    case "title":
      return <S.TitleScene {...p} />;
    case "section":
      return <S.SectionScene {...p} />;
    case "bullets":
      return <S.BulletsScene {...p} />;
    case "figure":
      return <S.FigureScene {...p} />;
    case "flow":
      return <S.FlowScene {...p} />;
    case "formula":
      return <S.FormulaScene {...p} />;
    case "compare":
      return <S.CompareScene {...p} />;
    case "bars":
      return <S.BarsScene {...p} />;
    case "outro":
      return <S.OutroScene {...p} />;
  }
}

/** 场景整体淡入淡出，与相邻场景交叠形成转场 */
function SceneFrame({ frames, children }: { frames: number; children: React.ReactNode }) {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, TRANSITION, frames - TRANSITION, frames], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return <AbsoluteFill style={{ opacity }}>{children}</AbsoluteFill>;
}

function Header({ meta }: { meta: ExplainerProps["meta"] }) {
  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        height: HEADER_H,
        display: "flex",
        alignItems: "center",
        padding: "0 60px",
        fontSize: 24,
        color: theme.muted,
        justifyContent: "space-between",
      }}
    >
      <span style={{ color: theme.accent, fontWeight: 700, letterSpacing: 2 }}>AI 前沿论文精读</span>
      <span style={{ fontFamily: "Inter, Segoe UI, sans-serif" }}>arXiv:{meta.arxivId}</span>
    </div>
  );
}

function Progress() {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  return (
    <div style={{ position: "absolute", left: 0, bottom: 0, height: 6, width: `${(frame / durationInFrames) * 100}%`, background: theme.accent }} />
  );
}

export function Explainer(props: ExplainerProps) {
  const { scenes, total } = timeline(props.storyboard.scenes, props.readingSpeed);
  const { fps } = useVideoConfig();
  return (
    <AbsoluteFill style={{ fontFamily: theme.font, color: theme.text }}>
      <Background />
      {props.musicUrl && (
        <Audio
          src={props.musicUrl}
          loop
          volume={(f) =>
            props.musicVolume *
            interpolate(f, [0, fps * 2, total - fps * 3, total], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })
          }
        />
      )}
      <Header meta={props.meta} />
      {scenes.map((t, i) => {
        const lead = t.scene.type === "title" ? 20 : 12;
        const cueStarts = t.cueFrames.map((_, k) => lead + t.cueFrames.slice(0, k).reduce((a, b) => a + b, 0));
        return (
          <Sequence key={i} from={t.from} durationInFrames={t.frames}>
            <SceneFrame frames={t.frames}>
              <SceneBody scene={t.scene} cueStarts={cueStarts} frames={t.frames} figures={props.figures} meta={props.meta} />
              <Subtitles cues={t.scene.cues} cueFrames={t.cueFrames} lead={lead} />
            </SceneFrame>
          </Sequence>
        );
      })}
      <Progress />
    </AbsoluteFill>
  );
}
