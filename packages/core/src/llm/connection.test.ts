import { test } from "node:test";
import assert from "node:assert/strict";
import { providerHeaders, providerOptionsSchema, redactProviderError, supportsEffort } from "./connection";
import { normalizeProviderBaseUrl } from "./compat";
import { modelsUrlCandidates } from "./endpoints";
import { PRESETS } from "./presets";

test("cc-switch 模板包含地区、套餐、四种 API 格式且没有重复 ID 或推广参数", () => {
  assert.ok(PRESETS.length > 250);
  assert.equal(new Set(PRESETS.map(p=>p.id)).size, PRESETS.length);
  for(const format of ["anthropic","openai","responses","gemini"]) assert.ok(PRESETS.some(p=>p.protocol===format));
  assert.ok(PRESETS.some(p=>p.region==="intl"));
  for(const p of PRESETS.filter(p=>p.source)) assert.ok(!/[?&](aff|ref|track|utm)/i.test(p.keyUrl ?? ""));
  assert.equal(PRESETS.find(p=>p.id==="codex")?.authType,"oauth");
  assert.ok(PRESETS.some(p=>p.source && p.protocol==="anthropic" && p.options?.authMode==="bearer"));
});
test("完整端点保留路径和参数；自定义列表地址不向其他候选发送凭据", () => {
  assert.equal(normalizeProviderBaseUrl("https://x.test/custom/messages?api-version=1","anthropic",true),"https://x.test/custom/messages?api-version=1");
  assert.equal(normalizeProviderBaseUrl("https://x.test/custom/","responses",true),"https://x.test/custom/");
  assert.equal(normalizeProviderBaseUrl("https://x.test/v1/responses","responses"),"https://x.test/v1");
  assert.deepEqual(modelsUrlCandidates({protocol:"openai",baseUrl:"https://x.test/v1",options:{modelsUrl:"https://x.test/available"}}),["https://x.test/available"]);
  assert.deepEqual(modelsUrlCandidates({protocol:"gemini",baseUrl:"https://x.test/v1beta"}),["https://x.test/v1beta/models"]);
});
test("认证方式显式控制，保留自定义头，拒绝换行、重复头和传输覆盖", () => {
  assert.equal(providerHeaders({protocol:"anthropic",apiKey:"KEY",options:{authMode:"bearer"}}).authorization,"Bearer KEY");
  assert.equal(providerHeaders({protocol:"gemini",apiKey:"KEY"})["x-goog-api-key"],"KEY");
  assert.equal(providerHeaders({protocol:"openai",apiKey:"KEY",options:{authMode:"none"}}).authorization,null);
  assert.equal(providerOptionsSchema.safeParse({headers:{"x-project":"a\r\nb"}}).success,false);
  assert.equal(providerOptionsSchema.safeParse({headers:{"X-Project":"a","x-project":"b"}}).success,false);
  assert.equal(providerOptionsSchema.safeParse({headers:{Host:"evil.test"}}).success,false);
  assert.equal(redactProviderError("key=SECRET extra=HEADER",{apiKey:"SECRET",options:{headers:{"x-extra":"HEADER"}}}),"key=*** extra=***");
});
test("非 Claude 兼容服务不猜测 effort；支持思考开关时不发送强度", () => {
  assert.equal(supportsEffort({protocol:"anthropic"},{modelId:"glm-5"}),false);
  assert.equal(supportsEffort({protocol:"openai",options:{reasoning:"effort"}},{modelId:"reasoner"}),true);
  assert.equal(supportsEffort({protocol:"responses",options:{reasoning:"off"}},{modelId:"gpt-test"}),false);
  assert.equal(supportsEffort({protocol:"openai",options:{reasoning:"thinking"}},{modelId:"reasoner"}),false);
});
