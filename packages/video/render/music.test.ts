import { test } from "node:test";
import assert from "node:assert/strict";
import { encodeWav, synthesizeMusic } from "./music";
import { timeline, cueFrames, storyboardSchema } from "../src/storyboard";
import { sampleProps } from "../src/sample";

test("合成音乐长度正确、无爆音、同 seed 可复现", () => {
  const a = synthesizeMusic(12, 7);
  const b = synthesizeMusic(12, 7);
  assert.equal(a.length, 12 * 44100);
  assert.deepEqual(a.slice(100000, 100010), b.slice(100000, 100010));
  assert.ok(a.every((x) => Math.abs(x) <= 0.71));
  const wav = encodeWav(a);
  assert.equal(wav.toString("ascii", 0, 4), "RIFF");
  assert.equal(wav.length, 44 + a.length * 2);
});

test("字幕时长随字数增长并有上下限", () => {
  const short = cueFrames({ zh: "好", en: "ok" }, 5);
  const long = cueFrames({ zh: "这是一条比较长的中文字幕用来测试时长是否随着字数增长", en: "a long subtitle" }, 5);
  assert.equal(short, 75);
  assert.ok(long > short);
  assert.ok(cueFrames({ zh: "字".repeat(500), en: "x" }, 5) <= 360);
});

test("时间线首尾相接且示例分镜合法", () => {
  storyboardSchema.parse(sampleProps.storyboard);
  const t = timeline(sampleProps.storyboard.scenes, 5);
  for (let i = 1; i < t.scenes.length; i++) {
    const prev = t.scenes[i - 1];
    assert.equal(t.scenes[i].from, prev.from + prev.frames - 15);
  }
  const last = t.scenes.at(-1)!;
  assert.equal(t.total, last.from + last.frames);
});
