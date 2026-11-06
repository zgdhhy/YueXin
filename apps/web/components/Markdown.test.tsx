import React from "react";
import { test } from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { Markdown } from "./Markdown";
import { load } from "cheerio";

test("独占一段的公式居中显示，句中变量保留行内格式", () => {
  const source = "句中变量 $q_t$ 保持行内。\n\n$$q_t = x + y$$\n\n$$\nx = y^2\n$$\n\n> $a = b$\n\n`$$code$$`";
  const html = load(renderToStaticMarkup(<Markdown source={source} reading />));
  assert.equal(html(".katex-display").length, 3);
  assert.equal(html("p > .katex:not(.katex-display > .katex)").length, 1);
  assert.equal(html("blockquote .katex-display").length, 1);
  assert.equal(html("p .katex-display").length, 0, "Display math does not create invalid paragraph nesting");
  assert.equal(html("code").text(), "$$code$$");
});

test("正文的美元金额不吞掉中间文字，数学公式和代码保持原样", () => {
  const html = renderToStaticMarkup(<Markdown source={'费用约 $0.38/任务，而另一模型约 $15.26/任务。也可从 $1.49，增加到 $18.29。\n\n变量 $q_t$ 和数值 $1.49$。\n\n`$0.38/任务`'} />);
  assert.match(html, /\$0\.38\/任务，而另一模型约 \$15\.26\/任务/);
  assert.match(html, /\$1\.49，增加到 \$18\.29/);
  assert.match(html, /class="katex"/);
  assert.match(html, /<code>\$0\.38\/任务<\/code>/);
});

test("阅读模式将长段落按整句分开，文字、公式和链接全部保留", () => {
  const sentence = "作者写道：“这项研究比较了不同观察方式在真实任务中的表现，强调需要结合机制和证据判断方法的价值，不能仅凭一组结果外推所有场景。”";
  const source = `${sentence.repeat(3)}关键量是 $q_t$，参见[论文原文](https://example.org/paper)。${sentence.repeat(4)}\n\n- 列表内容保持原样。`;
  const original = load(renderToStaticMarkup(<Markdown source={source} />));
  const reading = load(renderToStaticMarkup(<Markdown source={source} reading />));
  assert.ok(reading(".article > p").length > original(".article > p").length);
  assert.equal(reading(".article").text().replace(/\s/g, ""), original(".article").text().replace(/\s/g, ""));
  assert.equal(reading(".katex").length, original(".katex").length);
  assert.equal(reading("a").attr("href"), "https://example.org/paper");
  assert.equal(reading("li").text(), "列表内容保持原样。");
  reading(".article > p").each((_, el) => assert.doesNotMatch(reading(el).text(), /^[”’」』）)]/u));
});

test("旧模板的开篇一句话总结只保留原图，其他章节原样保留", async () => {
  const { withoutLegacySummary } = await import("./Markdown");
  const md = "## 一句话总结\n\n概括文字。\n\n![图一](figure://Figure 1)\n\n## 背景\n\n正文 $q_t$\n\n## 一句话总结\n\n不是开篇的同名章节保留";
  assert.equal(withoutLegacySummary(md), "![图一](figure://Figure 1)\n\n## 背景\n\n正文 $q_t$\n\n## 一句话总结\n\n不是开篇的同名章节保留");
  assert.equal(withoutLegacySummary("## 动机\n\n内容"), "## 动机\n\n内容");
  assert.equal(withoutLegacySummary("## 一句话总结\n\n只有这一节"), "## 一句话总结\n\n只有这一节");
});
