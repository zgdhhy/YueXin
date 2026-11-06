import { test } from "node:test";
import assert from "node:assert/strict";
import { notebookBlocks, notebookTextOffset } from "./notebook-markdown";

test("Markdown elements retain exact source ranges and list items edit independently", () => {
  const source = "# 标题\n\n斜体 *测试* 与 **加粗**。\n\n1. 第一项\n2. 第二项\n\n> 引用\n\n- 无序一\n- 无序二\n";
  const blocks = notebookBlocks(source);
  assert.deepEqual(blocks.map(block => block.source), ["# 标题", "斜体 *测试* 与 **加粗**。", "1. 第一项", "2. 第二项", "> 引用", "- 无序一", "- 无序二"]);
  for (const block of blocks) assert.equal(source.slice(block.from, block.to), block.source);
});

test("multiline code and tables remain a single editable element", () => {
  const source = "```ts\nconst x = 1;\n```\n\n| A | B |\n| - | - |\n| 1 | 2 |\n";
  const blocks = notebookBlocks(source);
  assert.equal(blocks.length, 2);
  assert.equal(blocks[0].source, "```ts\nconst x = 1;\n```");
  assert.equal(blocks[1].source, "| A | B |\n| - | - |\n| 1 | 2 |");
});

test("click positions follow rendered characters rather than element width", () => {
  const source = "## 标题与 **加粗**、*斜体* 和 [链接](https://example.org)";
  const runs = ["标题与 ", "加粗", "、", "斜体", " 和 ", "链接"];
  assert.equal(notebookTextOffset(source, runs, 0, 1), source.indexOf("标题") + 1);
  assert.equal(notebookTextOffset(source, runs, 1, 1), source.indexOf("加粗") + 1);
  assert.equal(notebookTextOffset(source, runs, 5, 1), source.indexOf("链接") + 1);
  assert.equal(notebookTextOffset("**重复** 和 **重复**", ["重复", " 和 ", "重复"], 2, 1), 12);
});
