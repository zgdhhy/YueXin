import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (file: string) => readFileSync(new URL(file, import.meta.url), "utf8");

test("全站变量与阅读页的配色保持一致", () => {
  const tokens = read("../app/tokens.css"), reader = read("../components/reader/reader-workspace.css");
  const names = ["paper", "wash", "surface", "surface-hover", "line", "line-strong", "ink", "body", "muted", "accent", "accent-hover", "accent-strong", "accent-soft", "accent-line", "mark", "mark-soft", "mark-line", "mark-text", "danger", "danger-soft", "success"];
  for (const name of names) {
    const value = (css: string, prefix: string) => css.match(new RegExp(`--${prefix}${name}:\\s*(#[0-9a-f]+)`))?.[1];
    assert.ok(value(tokens, "ds-"), name);
    assert.equal(value(tokens, "ds-"), value(reader, ""), name);
  }
});
