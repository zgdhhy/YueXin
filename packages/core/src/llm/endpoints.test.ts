import { test } from "node:test";
import assert from "node:assert/strict";
import { modelsUrlCandidates } from "./endpoints";
import { lookupModel } from "./catalog";

test("模型列表地址：带版本号的 base 只拼 /models", () => {
  assert.deepEqual(modelsUrlCandidates({ protocol: "openai", baseUrl: "https://open.bigmodel.cn/api/paas/v4/" }), [
    "https://open.bigmodel.cn/api/paas/v4/models",
  ]);
});

test("模型列表地址：Anthropic 兼容后缀会回退到根地址", () => {
  assert.deepEqual(modelsUrlCandidates({ protocol: "anthropic", baseUrl: "https://api.deepseek.com/anthropic" }), [
    "https://api.deepseek.com/anthropic/v1/models",
    "https://api.deepseek.com/anthropic/models",
    "https://api.deepseek.com/v1/models",
    "https://api.deepseek.com/models",
  ]);
});

test("模型列表地址：预设地址优先，未填 base 用官方地址", () => {
  assert.deepEqual(modelsUrlCandidates({ protocol: "anthropic", baseUrl: null }, "https://x.test/models"), [
    "https://x.test/models",
    "https://api.anthropic.com/v1/models",
    "https://api.anthropic.com/models",
  ]);
});

test("模型参数：精确、前缀、vendor 前缀与后缀", () => {
  assert.equal(lookupModel("claude-opus-5-5")?.priceInput, 4);
  assert.equal(lookupModel("deepseek-v4-flash-0731")?.priceOutput, 1.2);
  assert.equal(lookupModel("anthropic/claude-opus-5-5")?.maxOutputTokens, 128000);
  assert.equal(lookupModel("DeepSeek-V4-Pro[1M]")?.name, "DeepSeek V4 Pro");
  assert.equal(lookupModel("no-such-model"), undefined);
});

test("模型列表地址：Codex 订阅带客户端版本号", () => {
  assert.deepEqual(modelsUrlCandidates({ protocol: "codex", baseUrl: null }), [
    "https://chatgpt.com/backend-api/codex/models?client_version=0.200.0",
  ]);
});
