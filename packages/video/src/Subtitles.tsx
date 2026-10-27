import { interpolate, useCurrentFrame } from "remotion";
import type { Cue } from "./storyboard";
import { SUBTITLE_H, theme } from "./theme";

/** 底部双语字幕：按每条字幕的时长依次切换，带淡入淡出 */
export function Subtitles({ cues, cueFrames, lead }: { cues: Cue[]; cueFrames: number[]; lead: number }) {
  const frame = useCurrentFrame() - lead;
  if (frame < 0) return null;
  let start = 0;
  let idx = 0;
  while (idx < cues.length - 1 && frame >= start + cueFrames[idx]) {
    start += cueFrames[idx];
    idx++;
  }
  const local = frame - start;
  const len = cueFrames[idx];
  const opacity = interpolate(local, [0, 8, len - 6, len], [0, 1, 1, idx === cues.length - 1 ? 1 : 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const cue = cues[idx];
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 0,
        height: SUBTITLE_H,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 14,
        padding: "0 160px",
        background: "linear-gradient(to top, rgba(5,8,20,0.92), rgba(5,8,20,0.55) 70%, transparent)",
        opacity,
      }}
    >
      <div style={{ fontSize: 46, fontWeight: 600, color: theme.text, textAlign: "center", lineHeight: 1.35, textShadow: "0 2px 8px rgba(0,0,0,0.6)" }}>
        {cue.zh}
      </div>
      <div style={{ fontSize: 28, color: theme.muted, textAlign: "center", lineHeight: 1.35, fontFamily: "Inter, Segoe UI, Helvetica, Arial, sans-serif" }}>
        {cue.en}
      </div>
    </div>
  );
}
