import { Markdown, resolveFigures } from "@/components/Markdown";
import { Tag } from "@/components/admin/ui";

type DigestOutput = { titleZh: string; oneLiner: string; tags: string[]; contentMd: string };
type ReportOutput = { title: string; contentMd: string };
type StoryboardOutput = { scenes: ({ type: string; cues: { zh: string }[] } & Record<string, unknown>)[] };

const SCENE_NAMES: Record<string, string> = { title: "开场", section: "章节", bullets: "要点", figure: "原图", flow: "流程", formula: "公式", compare: "对比", bars: "数据", outro: "结尾" };

/** 场景里除字幕外的文字字段，按出现顺序拼成一行 */
function sceneText(scene: Record<string, unknown>): string {
  const parts: string[] = [];
  const walk = (v: unknown) => {
    if (typeof v === "string") parts.push(v);
    else if (typeof v === "number") parts.push(String(v));
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") Object.values(v).forEach(walk);
  };
  for (const [k, v] of Object.entries(scene)) if (k !== "type" && k !== "cues") walk(v);
  return parts.join(" · ");
}

/** 把某个环节的产出渲染成可读的样子，用于并排对比 */
export function OutputView({ stage, output, figures = [] }: { stage: string; output: unknown; figures?: { label: string; path: string }[] }) {
  if (stage === "digest") {
    const d = output as DigestOutput;
    return (
      <>
        <h2>{d.titleZh}</h2>
        <p>{d.oneLiner}</p>
        <div className="mb-6 flex flex-wrap gap-1.5">{d.tags.map((t) => <Tag key={t}>{t}</Tag>)}</div>
        <Markdown source={resolveFigures(d.contentMd, figures)} />
      </>
    );
  }
  if (stage === "report") {
    const r = output as ReportOutput;
    return (
      <>
        <h2>{r.title}</h2>
        <Markdown source={r.contentMd} />
      </>
    );
  }
  const script = output as { title?: string; shots?: { heading: string; visual: string; cues: { zh: string }[] }[] };
  if (script.shots) {
    return (
      <>
        {script.title && <h2>{script.title}</h2>}
        <ol className="output-scenes">
          {script.shots.map((shot, i) => (
            <li key={i}>
              <div><Tag>{i + 1}</Tag><strong>{shot.heading}</strong></div>
              <p className="mt-1 text-[13px] text-slate-500">{shot.visual}</p>
              <ul>{shot.cues.map((c, k) => <li key={k}>{c.zh}</li>)}</ul>
            </li>
          ))}
        </ol>
      </>
    );
  }
  // 旧版分镜（第 5 阶段之前的试写结果）
  const s = output as StoryboardOutput;
  return (
    <ol className="output-scenes">
      {s.scenes.map((scene, i) => (
        <li key={i}>
          <div><Tag>{SCENE_NAMES[scene.type] ?? scene.type}</Tag><span>{sceneText(scene)}</span></div>
          <ul>{scene.cues.map((c, k) => <li key={k}>{c.zh}</li>)}</ul>
        </li>
      ))}
    </ol>
  );
}

/** 左右并排对比两份产出 */
export function SideBySide({ left, right }: { left: { label: React.ReactNode; body: React.ReactNode }; right: { label: React.ReactNode; body: React.ReactNode } }) {
  return (
    <div className="output-compare">
      {[left, right].map((side, i) => (
        <section key={i} className="admin-preview">
          <div className="output-compare-label">{side.label}</div>
          {side.body}
        </section>
      ))}
    </div>
  );
}
