import { test } from "node:test";
import assert from "node:assert/strict";
import { parseDigest } from "./digest";

test("解析元信息块与正文", () => {
  const d = parseDigest(`---
title_zh: 测试标题
one_liner: 一句话
tags: 推理模型, 强化学习，测试时计算
---

## 一句话总结
内容`);
  assert.equal(d.titleZh, "测试标题");
  assert.deepEqual(d.tags, ["推理模型", "强化学习", "测试时计算"]);
  assert.ok(d.contentMd.startsWith("## 一句话总结"));
});

test("容忍代码块包裹", () => {
  const d = parseDigest("```markdown\n---\ntitle_zh: A\none_liner: B\ntags: x\n---\n## 背景\nC\n```");
  assert.equal(d.contentMd, "## 背景\nC");
});

test("缺少元信息时报错", () => {
  assert.throws(() => parseDigest("## 一句话总结\n内容"));
});
