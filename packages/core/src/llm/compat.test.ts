import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeProviderBaseUrl, isOfficialAnthropic } from "./compat";

test("固定协议下规范化完整端点，不根据厂商名称猜协议", () => {
  assert.equal(normalizeProviderBaseUrl(" https://x.test/v1/chat/completions/ ", "openai"), "https://x.test/v1");
  assert.equal(normalizeProviderBaseUrl("https://x.test/v1/messages", "anthropic"), "https://x.test");
  assert.equal(normalizeProviderBaseUrl("https://chatgpt.com/backend-api/codex/responses", "codex"), "https://chatgpt.com/backend-api/codex");
  assert.equal(normalizeProviderBaseUrl("https://x.test/anthropic", "openai"), "https://x.test/anthropic");
});
test("官方 Anthropic 识别使用精确主机，避免误发官方专用参数", () => {
  assert.equal(isOfficialAnthropic(null), true);
  assert.equal(isOfficialAnthropic("https://api.anthropic.com"), true);
  assert.equal(isOfficialAnthropic("https://api.anthropic.com.example.org"), false);
  assert.equal(isOfficialAnthropic("https://proxy.test/api.anthropic.com"), false);
});
