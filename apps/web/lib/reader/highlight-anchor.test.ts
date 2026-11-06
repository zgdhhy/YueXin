import assert from "node:assert/strict";
import test from "node:test";
import { locateHighlight } from "./highlight-anchor";

test("highlights keep the correct repeated quote after a revision shifts text", () => {
  const anchor = { quote: "结果", start: 3, prefix: "实验一", suffix: "显著" };
  assert.equal(locateHighlight("实验一结果显著，实验二结果一般", anchor), 3);
  assert.equal(locateHighlight("新增段落。实验一结果显著，实验二结果一般", anchor), 8);
  assert.equal(locateHighlight("实验二结果一般。实验一结果显著", anchor), 11);
  assert.equal(locateHighlight("原文已经移除", anchor), -1);
});
