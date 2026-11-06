import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { RenderInternals } from "@remotion/renderer";

/**
 * 参考视频分析：用 Remotion 自带的精简版 ffmpeg 读出时长、检测剪辑点（镜头切换），
 * 并均匀抽取几张关键帧交给能看图的模型。这个 ffmpeg 没有 select / fps 等滤镜，
 * 所以剪辑点由 Node 比较低分辨率灰度帧得到。
 */
const MAX_REFERENCE_SEC = 600;
/** 采样帧率与相邻帧平均灰度差的阈值（0–255） */
const SAMPLE_FPS = 2;
const CUT_THRESHOLD = 22;

const ff = (args: string[]) =>
  RenderInternals.callFf({ bin: "ffmpeg", args, indent: false, logLevel: "error", binariesDirectory: null, cancelSignal: undefined, options: { reject: false } });

export type ReferenceAnalysis = {
  durationSec: number;
  width: number;
  height: number;
  /** 镜头切换的时间点（秒） */
  cuts: number[];
  /** 平均每个镜头的秒数 */
  avgShotSec: number;
  /** 关键帧 JPEG 文件（绝对路径），按时间排列 */
  frames: string[];
};

/** 解析 ffmpeg 输出里的 Duration 与视频尺寸 */
export function parseProbe(stderr: string) {
  const d = stderr.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
  const v = stderr.match(/Stream #[^\n]*Video:[^\n]*?\b(\d{2,5})x(\d{2,5})\b/);
  return {
    durationSec: d ? Number(d[1]) * 3600 + Number(d[2]) * 60 + Number(d[3]) : 0,
    width: v ? Number(v[1]) : 0,
    height: v ? Number(v[2]) : 0,
  };
}

/** 读取 8 位灰度 PNG 的像素（ffmpeg 输出的小图），含各行过滤方式的还原 */
function readGrayPng(buf: Buffer): Uint8Array {
  let pos = 8;
  let width = 0;
  let height = 0;
  const idat: Buffer[] = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString("ascii", pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      if (data[8] !== 8 || data[9] !== 0) throw new Error("只支持 8 位灰度 PNG");
    } else if (type === "IDAT") idat.push(data);
    pos += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const out = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (width + 1)];
    for (let x = 0; x < width; x++) {
      const v = raw[y * (width + 1) + 1 + x];
      const a = x > 0 ? out[y * width + x - 1] : 0;
      const b = y > 0 ? out[(y - 1) * width + x] : 0;
      const c = x > 0 && y > 0 ? out[(y - 1) * width + x - 1] : 0;
      const p = a + b - c;
      const paeth = Math.abs(p - a) <= Math.abs(p - b) && Math.abs(p - a) <= Math.abs(p - c) ? a : Math.abs(p - b) <= Math.abs(p - c) ? b : c;
      const pred = [0, a, b, (a + b) >> 1, paeth][filter] ?? 0;
      out[y * width + x] = (v + pred) & 0xff;
    }
  }
  return out;
}

/** 相邻采样帧差异超过阈值的位置视为剪辑点（秒）；靠得太近的合并 */
export function detectCuts(frames: Uint8Array[], fps = SAMPLE_FPS, threshold = CUT_THRESHOLD) {
  const cuts: number[] = [];
  for (let i = 1; i < frames.length; i++) {
    const a = frames[i - 1];
    const b = frames[i];
    let sum = 0;
    for (let k = 0; k < a.length; k++) sum += Math.abs(a[k] - b[k]);
    const t = i / fps;
    if (sum / a.length > threshold && (!cuts.length || t - cuts.at(-1)! > 0.75)) cuts.push(t);
  }
  return cuts;
}

export async function analyzeReference(file: string, outDir: string, frameCount = 8): Promise<ReferenceAnalysis> {
  const probe = parseProbe((await ff(["-hide_banner", "-i", file])).stderr);
  if (!probe.durationSec) throw new Error("无法读取视频，请确认是常见格式（mp4 / mov / webm）");
  if (probe.durationSec > MAX_REFERENCE_SEC) throw new Error(`视频超过 ${MAX_REFERENCE_SEC / 60} 分钟，请截取一段再上传`);
  fs.mkdirSync(outDir, { recursive: true });

  const grayDir = path.join(outDir, "gray");
  fs.mkdirSync(grayDir, { recursive: true });
  await ff(["-hide_banner", "-y", "-i", file, "-an", "-r", String(SAMPLE_FPS), "-vf", "scale=32:18", "-pix_fmt", "gray", "-pred", "none", "-f", "image2", path.join(grayDir, "g-%05d.png")]);
  const gray = fs.readdirSync(grayDir).sort().map((f) => readGrayPng(fs.readFileSync(path.join(grayDir, f))));
  fs.rmSync(grayDir, { recursive: true, force: true });
  const cuts = detectCuts(gray);

  // 关键帧：均匀取在每段的中间，避开开头结尾的黑场
  const frames: string[] = [];
  for (let i = 0; i < frameCount; i++) {
    const t = ((i + 0.5) / frameCount) * probe.durationSec;
    const out = path.join(outDir, `frame-${String(i + 1).padStart(2, "0")}.jpg`);
    await ff(["-hide_banner", "-y", "-ss", t.toFixed(2), "-i", file, "-frames:v", "1", "-vf", "scale=768:-2", "-q:v", "4", out]);
    if (fs.existsSync(out)) frames.push(out);
  }
  if (!frames.length) throw new Error("没能从视频中抽出画面");
  return { ...probe, cuts, avgShotSec: probe.durationSec / (cuts.length + 1), frames };
}
