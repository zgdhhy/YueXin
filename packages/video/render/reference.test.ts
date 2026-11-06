import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { RenderInternals } from "@remotion/renderer";
import { analyzeReference, detectCuts, parseProbe } from "./reference";

/** 写一张纯色 24 位 BMP（ffmpeg 能读的最简单格式） */
function bmp(file: string, w: number, h: number, [r, g, b]: number[]) {
  const row = Math.ceil((w * 3) / 4) * 4;
  const buf = Buffer.alloc(54 + row * h);
  buf.write("BM", 0);
  buf.writeUInt32LE(buf.length, 2);
  buf.writeUInt32LE(54, 10);
  buf.writeUInt32LE(40, 14);
  buf.writeInt32LE(w, 18);
  buf.writeInt32LE(h, 22);
  buf.writeUInt16LE(1, 26);
  buf.writeUInt16LE(24, 28);
  buf.writeUInt32LE(row * h, 34);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) buf.set([b, g, r], 54 + y * row + x * 3);
  fs.writeFileSync(file, buf);
}

test("解析时长与尺寸；按相邻帧差异找剪辑点", () => {
  assert.deepEqual(parseProbe("  Duration: 00:01:02.50, start: 0\n  Stream #0:0: Video: h264, yuv420p, 1920x1080 [SAR 1:1], 30 fps"), { durationSec: 62.5, width: 1920, height: 1080 });
  const dark = new Uint8Array(16).fill(10);
  const light = new Uint8Array(16).fill(200);
  assert.deepEqual(detectCuts([dark, dark, light, light, light, dark], 2), [1, 2.5]);
});

test("对真实视频检测剪辑并抽出关键帧", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "paper-ref-"));
  const colors = [[220, 30, 30], [30, 200, 60], [30, 60, 220]];
  colors.forEach((c, i) => bmp(path.join(dir, `${i}.bmp`), 320, 180, c));
  const file = path.join(dir, "ref.mp4");
  const ff = (args: string[]) => RenderInternals.callFf({ bin: "ffmpeg", args, indent: false, logLevel: "error", binariesDirectory: null, cancelSignal: undefined });
  // 红、绿、蓝各 2 秒，应检测到 2 次剪辑
  await ff([
    "-hide_banner", "-y",
    ...colors.flatMap((_, i) => ["-loop", "1", "-framerate", "30", "-t", "2", "-i", path.join(dir, `${i}.bmp`)]),
    "-filter_complex", "[0:v][1:v][2:v]concat=n=3:v=1:a=0,scale=320:180", "-pix_fmt", "yuv420p", "-c:v", "libx264", file,
  ]);
  const r = await analyzeReference(file, path.join(dir, "frames"), 6);
  assert.ok(Math.abs(r.durationSec - 6) < 0.2, String(r.durationSec));
  assert.deepEqual([r.width, r.height], [320, 180]);
  assert.equal(r.cuts.length, 2, JSON.stringify(r.cuts));
  assert.ok(Math.abs(r.avgShotSec - 2) < 0.2);
  assert.equal(r.frames.length, 6);
  await assert.rejects(analyzeReference(path.join(dir, "missing.mp4"), path.join(dir, "x")), /无法读取视频/);
});
