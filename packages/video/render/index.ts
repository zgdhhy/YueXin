import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { bundle } from "@remotion/bundler";
import { renderMedia, renderStill, selectComposition } from "@remotion/renderer";
import { FPS, LEAD, timeline, TRANSITION, type Cue, type ExplainerProps } from "../src/script";
import type { StyleTokens } from "../src/theme";
import { encodeWav, synthesizeMusic } from "./music";

export { synthesizeMusic, encodeWav };
export { compileShot, extractCode, type CompiledShot } from "./compile";

const here = path.dirname(fileURLToPath(import.meta.url));
let bundlePromise: Promise<string> | null = null;

const TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".wav": "audio/wav",
  ".mp3": "audio/mpeg",
  ".m4a": "audio/mp4",
  ".ogg": "audio/ogg",
};

/**
 * 向系统要一个空闲端口给 Remotion 托管打包产物。它默认从 3000 开始找，
 * 在 Windows 上可能误判已被 Next 占用的 3000 为空闲，结果打开错误的页面。
 */
function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const s = http.createServer();
    s.once("error", reject);
    s.listen(0, "127.0.0.1", () => {
      const { port } = s.address() as { port: number };
      s.close(() => resolve(port));
    });
  });
}

/** webpack 打包只在进程内做一次；镜头代码在渲染时由 runtime 加载，不需要重新打包 */
function getBundle() {
  bundlePromise ??= bundle({ entryPoint: path.join(here, "../src/index.ts") }).catch((e) => {
    bundlePromise = null;
    throw e;
  });
  return bundlePromise;
}

/**
 * 渲染期间用本地 HTTP 服务提供本视频用到的图片与音频。
 * 只放行列出的文件：镜头代码来自大模型，不能让它读到 DATA_DIR 里的数据库等文件。
 */
function serveFiles(root: string, allowed: string[]): Promise<{ url: string; close: () => void }> {
  const ok = new Set(allowed.map((rel) => path.resolve(root, rel)));
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(new URL(req.url ?? "/", "http://x").pathname).replace(/^\/+/, "");
    const file = path.resolve(root, rel);
    if (!ok.has(file) || !fs.existsSync(file)) {
      res.writeHead(404).end();
      return;
    }
    const size = fs.statSync(file).size;
    const type = TYPES[path.extname(file).toLowerCase()] ?? "application/octet-stream";
    const headers = { "access-control-allow-origin": "*", "content-type": type, "accept-ranges": "bytes" };
    // 媒体元素需要 Range 请求才能读取时长
    const m = req.headers.range?.match(/bytes=(\d*)-(\d*)/);
    if (m) {
      const start = m[1] ? Number(m[1]) : 0;
      const end = m[2] ? Math.min(Number(m[2]), size - 1) : size - 1;
      res.writeHead(206, { ...headers, "content-length": end - start + 1, "content-range": `bytes ${start}-${end}/${size}` });
      fs.createReadStream(file, { start, end }).pipe(res);
      return;
    }
    res.writeHead(200, { ...headers, "content-length": size });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as { port: number };
      resolve({ url: `http://127.0.0.1:${port}`, close: () => server.close() });
    });
  });
}

export interface RenderShotInput {
  heading: string;
  cues: Cue[];
  /** 编译后的镜头代码；为空时显示标题 + 文案 */
  js: string | null;
  /** 每条字幕的旁白（相对 dataDir 的路径与时长） */
  narration: { path: string; sec: number }[] | null;
}

export interface RenderOptions {
  dataDir: string;
  shots: RenderShotInput[];
  style: StyleTokens;
  /** 原图标签 → 相对 dataDir 的路径 */
  figures: Record<string, string>;
  /** 曲库音乐（相对 dataDir）；为 null 且 procedural 为 true 时自动合成 */
  musicPath: string | null;
  procedural: boolean;
  seed: number;
  musicVolume: number;
  readingSpeed: number;
  meta: ExplainerProps["meta"];
  /** 输出路径（相对 dataDir） */
  outPath: string;
  /** 每个镜头一张缩略图的目录（相对 dataDir）；为空则不生成 */
  thumbsDir?: string;
  onProgress?: (p: number) => void;
}

export interface RenderResult {
  durationSec: number;
  /** 渲染时出错、退化为简单画面的镜头 */
  failed: { index: number; error: string }[];
  /** 镜头缩略图（相对 dataDir），没有生成时为 null */
  thumbs: (string | null)[];
}

export async function renderExplainer(o: RenderOptions): Promise<RenderResult> {
  const timed = timeline(
    o.shots.map((s) => ({ ...s, narration: s.narration?.map((n) => ({ url: "", sec: n.sec })) ?? null })),
    o.readingSpeed,
  );
  const durationSec = timed.total / FPS;

  let musicPath = o.musicPath;
  if (!musicPath && o.procedural) {
    musicPath = path.posix.join(path.posix.dirname(o.outPath), "music.wav");
    fs.mkdirSync(path.join(o.dataDir, path.dirname(musicPath)), { recursive: true });
    fs.writeFileSync(path.join(o.dataDir, musicPath), encodeWav(synthesizeMusic(durationSec + 1, o.seed)));
  }

  const files = [...Object.values(o.figures), ...(musicPath ? [musicPath] : []), ...o.shots.flatMap((s) => s.narration?.map((n) => n.path) ?? [])];
  const server = await serveFiles(o.dataDir, files);
  const toUrl = (rel: string) => `${server.url}/${rel.split("/").map(encodeURIComponent).join("/")}`;
  const failed = new Map<number, string>();
  const onBrowserLog = ({ text }: { text: string }) => {
    const m = text.match(/SHOT_FAILED (\d+) ([\s\S]*)/);
    if (m && !failed.has(Number(m[1]))) failed.set(Number(m[1]), m[2].slice(0, 500));
  };
  try {
    const inputProps: ExplainerProps = {
      shots: o.shots.map((s) => ({ heading: s.heading, cues: s.cues, js: s.js, narration: s.narration?.map((n) => ({ url: toUrl(n.path), sec: n.sec })) ?? null })),
      style: o.style,
      figures: Object.fromEntries(Object.entries(o.figures).map(([k, v]) => [k, toUrl(v)])),
      musicUrl: musicPath ? toUrl(musicPath) : null,
      musicVolume: o.musicVolume,
      readingSpeed: o.readingSpeed,
      meta: o.meta,
    };
    const serveUrl = await getBundle();
    const browserExecutable = process.env.REMOTION_BROWSER || null;
    const port = await freePort();
    const composition = await selectComposition({ serveUrl, id: "Explainer", inputProps, browserExecutable, port });
    const out = path.join(o.dataDir, o.outPath);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    await renderMedia({
      composition,
      serveUrl,
      codec: "h264",
      outputLocation: out,
      inputProps,
      browserExecutable,
      concurrency: Number(process.env.RENDER_CONCURRENCY) || null,
      port,
      onBrowserLog,
      onProgress: ({ progress }) => o.onProgress?.(progress),
    });

    const thumbs: (string | null)[] = [];
    for (const [i, t] of timed.shots.entries()) {
      if (!o.thumbsDir) {
        thumbs.push(null);
        continue;
      }
      const rel = path.posix.join(o.thumbsDir, `${i + 1}.jpg`);
      try {
        fs.mkdirSync(path.join(o.dataDir, o.thumbsDir), { recursive: true });
        // 取镜头里第一条字幕出现约 1.5 秒后的画面
        const frame = t.from + Math.min(t.frames - TRANSITION - 1, LEAD + 45);
        await renderStill({ composition, serveUrl, inputProps, browserExecutable, frame, output: path.join(o.dataDir, rel), imageFormat: "jpeg", jpegQuality: 70, scale: 0.25, port, onBrowserLog });
        thumbs.push(rel);
      } catch {
        thumbs.push(null);
      }
    }
    return { durationSec, failed: [...failed].map(([index, error]) => ({ index, error })).sort((a, b) => a.index - b.index), thumbs };
  } finally {
    server.close();
  }
}
