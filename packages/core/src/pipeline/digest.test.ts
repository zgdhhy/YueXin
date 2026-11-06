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

test("自由章节与旧八段均可解析，普通连续文字不能替代分节", () => {
  const meta = "---\ntitle_zh: A\none_liner: B\ntags: x\n---\n";
  for (const names of [["动机", "方法与实验", "边界"], ["难点", "直觉", "机制", "证据", "限制", "研究联系"], ["一句话总结", "背景：问题从哪里来", "核心思路", "技术细节", "实验：结果说明了什么", "局限与争议", "趋势定位", "术语表"]]) {
    const md = names.map(name => `## ${name}\n内容`).join("\n\n");
    assert.equal(parseDigest(meta + md).contentMd, md);
  }
  assert.throws(() => parseDigest(meta + "没有章节的正文"), /缺少分节/);
});
