import { test } from "node:test";
import assert from "node:assert/strict";
import { encodeWav, synthesizeMusic } from "./music";
import { timeline, cueFrames, TRANSITION } from "../src/script";
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

test("有旁白时字幕时长跟随语音", () => {
  assert.equal(cueFrames({ zh: "字".repeat(40), en: "x" }, 5, 2), Math.round(2.35 * 30));
  assert.equal(cueFrames({ zh: "好", en: "ok" }, 5, 0.2), 45);
});

test("时间线首尾相接，镜头内字幕起点递增", () => {
  const t = timeline(sampleProps.shots, 5);
  for (let i = 1; i < t.shots.length; i++) {
    const prev = t.shots[i - 1];
    assert.equal(t.shots[i].from, prev.from + prev.frames - TRANSITION);
  }
  const last = t.shots.at(-1)!;
  assert.equal(t.total, last.from + last.frames);
  const two = t.shots[1];
  assert.equal(two.cueStarts[1], two.cueStarts[0] + two.cueFrames[0]);
});
