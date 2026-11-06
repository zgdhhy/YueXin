import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "reading-highlights-"));
const highlights = await import("./reading-highlights");
const anchor = { quote: "实验结果", prefix: "", suffix: "", start: 10 };

test("highlight storage keeps notebook/report scopes independent and rejects cross-document changes", () => {
  const first = highlights.addReadingHighlight("paper-a", anchor);
  assert.equal(highlights.addReadingHighlight("paper-a", anchor).id, first.id);
  highlights.addReadingHighlight("report:2026-10", anchor);
  assert.equal(highlights.listReadingHighlights("paper-a").length, 1);
  assert.throws(() => highlights.updateReadingHighlight("paper-b", first.id, "wrong document"));
  highlights.removeReadingHighlight("paper-b", first.id);
  assert.equal(highlights.listReadingHighlights("paper-a").length, 1);
  highlights.updateReadingHighlight("paper-a", first.id, "我的批注");
  assert.equal(highlights.listReadingHighlights("paper-a")[0].comment, "我的批注");
  highlights.removeReadingHighlight("paper-a", first.id);
  assert.equal(highlights.listReadingHighlights("paper-a").length, 0);
  assert.equal(highlights.listReadingHighlights("report:2026-10").length, 1);
  assert.throws(() => highlights.addReadingHighlight("paper-a", { ...anchor, quote: " " }));
  assert.throws(() => highlights.addReadingHighlight("paper-a", { ...anchor, start: -1 }));
});

test("highlight colors and initial notes persist; duplicate selections recolor without losing a comment", () => {
  const item = highlights.addReadingHighlight("colors", anchor, { color: "#65de76", comment: "绿色批注" });
  assert.equal(item.color, "#65de76");
  assert.equal(highlights.listReadingHighlights("colors")[0].comment, "绿色批注");
  const recolored = highlights.addReadingHighlight("colors", anchor, { color: "#7d82ff" });
  assert.equal(recolored.id, item.id);
  assert.equal(recolored.color, "#7d82ff");
  assert.equal(recolored.comment, "绿色批注");
  assert.equal(highlights.updateReadingHighlight("colors", item.id, "新批注").color, "#7d82ff");
  assert.equal(highlights.addReadingHighlight("default-color", anchor).color, "#ffe066");
  assert.throws(() => highlights.addReadingHighlight("colors", anchor, { color: "red;}" }), /颜色/);
  assert.throws(() => highlights.addReadingHighlight("colors", anchor, { comment: "a".repeat(5001) }), /5000/);
  const changed = highlights.updateReadingHighlight("colors", item.id, "", { color: "#ff626b", anchor: { ...anchor, quote: "修改后的选区", start: 20 } });
  assert.equal(changed.id, item.id);
  assert.equal(changed.quote, "修改后的选区");
  assert.equal(changed.color, "#ff626b");
  assert.equal(changed.comment, "");
  assert.throws(() => highlights.updateReadingHighlight("other", item.id, "", { color: "#ffe066" }), /不存在/);
  assert.throws(() => highlights.updateReadingHighlight("colors", item.id, "", { anchor: { ...anchor, quote: "" } }), /有效/);
});
