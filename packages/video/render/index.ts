import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import { FPS, timeline, type ExplainerProps, type Storyboard } from "../src/storyboard";
import { encodeWav, synthesizeMusic } from "./music";

export { synthesizeMusic, encodeWav };

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

/** webpack 打包只在进程内做一次 */
function getBundle() {
  bundlePromise ??= bundle({ entryPoint: path.join(here, "../src/index.ts") }).catch((e) => {
    bundlePromise = null;
    throw e;
  });
  return bundlePromise;
}

/** 渲染期间用本地 HTTP 服务把 DATA_DIR 里的图片与音乐提供给无头浏览器 */
function serveDir(root: string): Promise<{ url: string; close: () => void }> {
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(new URL(req.url ?? "/", "http://x").pathname).replace(/^\/+/, "");
    const file = path.resolve(root, rel);
    if (!file.startsWith(path.resolve(root) + path.sep) || !fs.existsSync(file)) {
      res.writeHead(404).end();
      return;
    }
    const size = fs.statSync(file).size;
    const ext = path.extname(file).toLowerCase();
    const type = TYPES[ext] ?? "application/octet-stream";
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

export interface RenderOptions {
  dataDir: string;
  storyboard: Storyboard;
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
  onProgress?: (p: number) => void;
}

export async function renderExplainer(o: RenderOptions): Promise<{ durationSec: number }> {
  const { total } = timeline(o.storyboard.scenes, o.readingSpeed);
  const durationSec = total / FPS;

  let musicPath = o.musicPath;
  if (!musicPath && o.procedural) {
    musicPath = path.posix.join(path.posix.dirname(o.outPath), "music.wav");
    fs.mkdirSync(path.join(o.dataDir, path.dirname(musicPath)), { recursive: true });
    fs.writeFileSync(path.join(o.dataDir, musicPath), encodeWav(synthesizeMusic(durationSec + 1, o.seed)));
  }

  const server = await serveDir(o.dataDir);
  const toUrl = (rel: string) => `${server.url}/${rel.split("/").map(encodeURIComponent).join("/")}`;
  try {
    const inputProps: ExplainerProps = {
      storyboard: o.storyboard,
      figures: Object.fromEntries(Object.entries(o.figures).map(([k, v]) => [k, toUrl(v)])),
      musicUrl: musicPath ? toUrl(musicPath) : null,
      musicVolume: o.musicVolume,
      readingSpeed: o.readingSpeed,
      meta: o.meta,
    };
    const serveUrl = await getBundle();
    const browserExecutable = process.env.REMOTION_BROWSER || null;
    const composition = await selectComposition({ serveUrl, id: "Explainer", inputProps, browserExecutable });
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
      onProgress: ({ progress }) => o.onProgress?.(progress),
    });
    return { durationSec };
  } finally {
    server.close();
  }
}
