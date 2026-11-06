import { test } from "node:test";
import assert from "node:assert/strict";
import { EditorState } from "@codemirror/state";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { notebookPresentation } from "./notebook-presentation";

const state = (doc: string, anchor = 0) => EditorState.create({ doc, selection: { anchor }, extensions: [markdown({ base: markdownLanguage })] });

test("the selected heading retains its typography and only reveals the heading marker", () => {
  const doc = "# 标题\n\n正文";
  for (const focused of [false, true]) {
    const plan = notebookPresentation(state(doc, 3), focused);
    assert.ok(plan.lines[0].classes.has("notebook-heading-1"));
    assert.equal(plan.lines[0].attributes["aria-level"], "1");
    assert.equal(plan.hidden.some(span => span.from === 0), !focused);
  }
});

test("inline styling remains while syntax is revealed only around the selected element", () => {
  const doc = "*斜体* **加粗** ***加粗斜体***";
  const plan = notebookPresentation(state(doc, doc.indexOf("加粗斜体") + 1), true);
  assert.ok(plan.marks.some(mark => mark.tagName === "strong"));
  assert.ok(plan.marks.some(mark => mark.tagName === "em"));
  const revealed = plan.marks.filter(mark => mark.className === "notebook-syntax");
  assert.ok(revealed.length >= 4);
  assert.ok(revealed.every(mark => mark.from >= doc.indexOf("***")));
  assert.ok(plan.hidden.some(span => span.from === 0));
});

test("list bullets and quote borders remain during input, including empty items", () => {
  const doc = "1. 有序\n\n- 无序\n- \n\n> 引用\n> ";
  const plan = notebookPresentation(state(doc, doc.length), true);
  assert.equal(plan.bullets.length, 2);
  assert.ok(plan.marks.some(mark => mark.className === "notebook-list-number"));
  assert.equal(plan.lines.filter(line => line.classes.has("notebook-quote-line")).length, 2);
  assert.ok(plan.hidden.some(span => doc.slice(span.from, span.to) === "> "));
  assert.ok(plan.marks.some(mark => mark.className === "notebook-syntax" && mark.to === doc.length));
});

test("math previews exclude code and dollar amounts, while the selected formula stays editable", () => {
  const doc = "费用 $0.38/任务，与 $15.26/任务；`$code$`，公式 $x^2$";
  const plan = notebookPresentation(state(doc, doc.indexOf("x^2") + 1), true);
  assert.equal(plan.math.length, 1);
  assert.equal(plan.math[0].source, "$x^2$");
  assert.equal(plan.math[0].active, true);
});
