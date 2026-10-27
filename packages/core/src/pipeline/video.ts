import { eq } from "drizzle-orm";
import { storyboardSchema, type Storyboard } from "@paper/video/storyboard";
import { renderExplainer } from "@paper/video/render";
import { db, schema } from "../db";
import { env } from "../env";
import { generateJson, llmForStage } from "../llm";
import { STORYBOARD_SYSTEM, storyboardPrompt } from "../prompts/storyboard";
import { getSetting } from "../settings";
import type { Log } from "./select";

function loadDigest(digestId: number) {
  const row = db
    .select()
    .from(schema.digests)
    .innerJoin(schema.papers, eq(schema.papers.id, schema.digests.paperId))
    .where(eq(schema.digests.id, digestId))
    .get();
  if (!row) throw new Error(`解读 ${digestId} 不存在`);
  const figures = db.select().from(schema.figures).where(eq(schema.figures.paperId, row.digests.paperId)).all();
  return { digest: row.digests, paper: row.papers, figures };
}

export async function writeStoryboard(digestId: number, log: Log): Promise<Storyboard> {
  const { digest, figures } = loadDigest(digestId);
  const labels = new Set(figures.map((f) => f.label));
  const llm = llmForStage("storyboard");
  log(`生成分镜中（${llm.label}）…`);
  const storyboard = await generateJson(
    llm,
    {
      system: STORYBOARD_SYSTEM,
      prompt: storyboardPrompt({
        title: digest.titleZh,
        oneLiner: digest.oneLiner,
        // 正文里的 figure:// 引用对分镜无用，换成标签文字
        digest: digest.contentMd.replace(/!\[([^\]]*)\]\(figure:\/\/([^)]+)\)/g, "[原图 $2：$1]"),
        figures: figures.map((f) => `${f.label} | ${f.caption}`).join("\n"),
      }),
    },
    storyboardSchema.refine(
      (s) => s.scenes.every((sc) => sc.type !== "figure" || labels.has(sc.figure)),
      "figure 场景引用了不存在的原图标签",
    ),
  );
  const cues = storyboard.scenes.reduce((n, s) => n + s.cues.length, 0);
  log(`分镜完成：${storyboard.scenes.length} 个场景，${cues} 条字幕`);
  db.insert(schema.storyboards)
    .values({ digestId, scenes: storyboard })
    .onConflictDoUpdate({ target: schema.storyboards.digestId, set: { scenes: storyboard } })
    .run();
  return storyboard;
}

function pickMusic(seed: number): { path: string | null; procedural: boolean } {
  const mode = getSetting("video").musicMode;
  if (mode === "none") return { path: null, procedural: false };
  if (mode === "library") {
    const tracks = db.select().from(schema.musicTracks).all();
    if (tracks.length) return { path: tracks[seed % tracks.length].path, procedural: false };
  }
  // 曲库为空时退回程序化合成
  return { path: null, procedural: true };
}

export async function renderVideo(digestId: number, storyboard: Storyboard, log: Log) {
  const { digest, paper, figures } = loadDigest(digestId);
  const video = getSetting("video");
  const music = pickMusic(digestId);
  log(`渲染视频中（背景音乐：${music.path ?? (music.procedural ? "程序化合成" : "无")}）…`);
  let lastLogged = 0;
  const outPath = `videos/${digest.paperId}/explainer.mp4`;
  const { durationSec } = await renderExplainer({
    dataDir: env.dataDir,
    storyboard,
    figures: Object.fromEntries(figures.map((f) => [f.label, f.path])),
    musicPath: music.path,
    procedural: music.procedural,
    seed: digestId * 7919,
    musicVolume: video.musicVolume,
    readingSpeed: video.readingSpeed,
    meta: { arxivId: paper.id, paperTitle: paper.title, date: digest.createdAt.slice(0, 10) },
    outPath,
    onProgress: (p) => {
      if (p - lastLogged >= 0.1 || p === 1) {
        lastLogged = p;
        log(`渲染进度 ${(p * 100).toFixed(0)}%`);
      }
    },
  });
  db.insert(schema.videos)
    .values({ digestId, path: outPath, durationSec })
    .onConflictDoUpdate({ target: schema.videos.digestId, set: { path: outPath, durationSec, createdAt: new Date().toISOString() } })
    .run();
  log(`视频完成：${Math.floor(durationSec / 60)} 分 ${Math.round(durationSec % 60)} 秒`);
}
