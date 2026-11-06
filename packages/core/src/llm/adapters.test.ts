import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.DATA_DIR=fs.mkdtempSync(path.join(os.tmpdir(),"paper-adapter-"));
const {db,schema}=await import("../db");
const {eq}=await import("drizzle-orm");
const {getModelPolicy,saveModelPolicy,createModelSnapshot}=await import("../model-policy");
const {llmForStage,listRemoteModels,withRunContext}=await import("./index");
type Protocol=typeof schema.llmProviders.$inferSelect.protocol;
const sse=(events:Record<string,unknown>[])=>new Response(events.map(e=>`${e.type?`event: ${e.type}\n`:""}data: ${JSON.stringify(e)}\n\n`).join(""),{headers:{"content-type":"text/event-stream"}});
function target(protocol:Protocol,options:typeof schema.llmProviders.$inferSelect.options=null) {
  const p=db.insert(schema.llmProviders).values({name:"fixture",protocol,apiKey:"API-SECRET",baseUrl:"https://fixture.invalid/v1",options}).returning().get();
  const m=db.insert(schema.llmModels).values({providerId:p.id,modelId:"local-alias",upstreamModelId:"actual-model",effort:null}).returning().get();
  saveModelPolicy({...getModelPolicy(),confirmed:true,defaultModelId:m.id,fallbackModelId:null});
  return {p,m};
}
test("Chat 格式使用模型映射、自定义认证头和 max_completion_tokens",async t=>{
  target("openai",{authMode:"none",headers:{"api-key":"HEADER-SECRET"},maxTokensField:"max_completion_tokens",reasoning:"off"});
  t.mock.method(globalThis,"fetch",async (url: Parameters<typeof fetch>[0],init?: Parameters<typeof fetch>[1])=>{const h=new Headers(init?.headers);const body=JSON.parse(String(init?.body));assert.equal(String(url),"https://fixture.invalid/v1/chat/completions");assert.equal(body.model,"actual-model");assert.equal(body.max_completion_tokens,32000);assert.equal(body.reasoning_effort,undefined);assert.equal(h.get("authorization"),null);assert.equal(h.get("api-key"),"HEADER-SECRET");return sse([{choices:[{delta:{content:"ok"},finish_reason:"stop"}],usage:{prompt_tokens:1,completion_tokens:2}}]);});
  const deltas: string[] = [];
  assert.equal(await llmForStage("digest").generate({system:"system",prompt:"prompt",onText: text => deltas.push(text)}),"ok");
  assert.deepEqual(deltas, ["ok"]);
});
test("Responses 格式支持完整 URL 和输出上限",async t=>{
  target("responses",{fullUrl:true,reasoning:"off"});
  t.mock.method(globalThis,"fetch",async(url: Parameters<typeof fetch>[0],init?: Parameters<typeof fetch>[1])=>{assert.equal(String(url),"https://fixture.invalid/v1");const b=JSON.parse(String(init?.body));assert.equal(b.max_output_tokens,32000);assert.equal(b.store,false);assert.equal(b.model,"actual-model");return sse([{type:"response.output_text.delta",delta:"ok"},{type:"response.completed",response:{status:"completed",usage:{input_tokens:2,output_tokens:3}}}]);});
  const deltas: string[] = [];
  assert.equal(await llmForStage("digest").generate({system:"system",prompt:"prompt",onText: text => deltas.push(text)}),"ok");
  assert.deepEqual(deltas, ["ok"]);
});
test("Gemini 原生接口使用 x-goog-api-key，过滤思考文本并记录 token",async t=>{
  const {p}=target("gemini");db.update(schema.llmProviders).set({baseUrl:"https://fixture.invalid/v1beta"}).where(eq(schema.llmProviders.id,p.id)).run();
  t.mock.method(globalThis,"fetch",async(url: Parameters<typeof fetch>[0],init?: Parameters<typeof fetch>[1])=>{assert.equal(String(url),"https://fixture.invalid/v1beta/models/actual-model:generateContent");assert.equal(new Headers(init?.headers).get("x-goog-api-key"),"API-SECRET");return Response.json({candidates:[{content:{parts:[{text:"private",thought:true},{text:"ok"}]},finishReason:"STOP"}],usageMetadata:{promptTokenCount:2,candidatesTokenCount:3,thoughtsTokenCount:4}});});
  assert.equal(await llmForStage("digest").generate({system:"system",prompt:"prompt"}),"ok");assert.equal(db.select().from(schema.llmCalls).all().at(-1)?.outputTokens,7);
});
test("显式配置的 Responses 思考强度原样发送，不静默改成其他等级",async t=>{
  const {m}=target("responses",{reasoning:"effort"});db.update(schema.llmModels).set({effort:"max"}).where(eq(schema.llmModels.id,m.id)).run();
  t.mock.method(globalThis,"fetch",async(_url:Parameters<typeof fetch>[0],init?:Parameters<typeof fetch>[1])=>{assert.equal(JSON.parse(String(init?.body)).reasoning.effort,"max");return sse([{type:"response.output_text.delta",delta:"ok"},{type:"response.completed",response:{status:"completed",usage:{input_tokens:1,output_tokens:1}}}]);});
  assert.equal(await llmForStage("digest").generate({system:"s",prompt:"p"}),"ok");
});
test("Anthropic Bearer 认证不混入 x-api-key，完整端点不追加路径",async t=>{
  target("anthropic",{authMode:"bearer",fullUrl:true});
  t.mock.method(globalThis,"fetch",async(url: Parameters<typeof fetch>[0],init?: Parameters<typeof fetch>[1])=>{const h=new Headers(init?.headers);assert.equal(h.get("authorization"),"Bearer API-SECRET");assert.equal(h.get("x-api-key"),null);assert.equal(String(url),"https://fixture.invalid/v1");return sse([{type:"message_start",message:{id:"msg",type:"message",role:"assistant",model:"actual-model",content:[],usage:{input_tokens:1,output_tokens:0},stop_reason:null}},{type:"content_block_start",index:0,content_block:{type:"text",text:""}},{type:"content_block_delta",index:0,delta:{type:"text_delta",text:"ok"}},{type:"content_block_stop",index:0},{type:"message_delta",delta:{stop_reason:"end_turn"},usage:{output_tokens:2}},{type:"message_stop"}]);});
  const deltas: string[] = [];
  assert.equal(await llmForStage("digest").generate({system:"system",prompt:"prompt",onText: text => deltas.push(text)}),"ok");
  assert.deepEqual(deltas, ["ok"]);
});

test("Gemini streams public text only and accumulates usage", async t => {
  target("gemini");
  t.mock.method(globalThis, "fetch", async (url: unknown) => {
    assert.match(String(url), /streamGenerateContent\?alt=sse$/);
    return sse([
      { candidates: [{ content: { parts: [{ text: "private", thought: true }, { text: "你" }] } }] },
      { candidates: [{ content: { parts: [{ text: "好" }] }, finishReason: "STOP" }], usageMetadata: { promptTokenCount: 2, candidatesTokenCount: 3, thoughtsTokenCount: 4 } },
    ]);
  });
  const deltas: string[] = [];
  assert.equal(await llmForStage("chat").generate({ system: "s", prompt: "p", onText: text => deltas.push(text) }), "你好");
  assert.deepEqual(deltas, ["你", "好"]);
  assert.equal(db.select().from(schema.llmCalls).all().at(-1)?.outputTokens, 7);
});
test("快照不含自定义头秘密，运行时读取最新请求头",async t=>{
  const {p}=target("openai",{headers:{"x-project":"HEADER-SECRET"}});const snapshot=createModelSnapshot(["digest"]);assert.ok(!JSON.stringify(snapshot).includes("SECRET"));
  db.update(schema.llmProviders).set({options:{headers:{"x-project":"ROTATED-SECRET"}}}).where(eq(schema.llmProviders.id,p.id)).run();
  t.mock.method(globalThis,"fetch",async(_url: Parameters<typeof fetch>[0],init?: Parameters<typeof fetch>[1])=>{assert.equal(new Headers(init?.headers).get("x-project"),"ROTATED-SECRET");return sse([{choices:[{delta:{content:"ok"},finish_reason:"stop"}]}]);});
  assert.equal(await withRunContext(900,()=>llmForStage("digest").generate({system:"s",prompt:"p"}),snapshot),"ok");
});
test("上游错误中的 API Key 与自定义头同时脱敏，不写入日志",async t=>{
  target("gemini",{headers:{"x-project":"HEADER-SECRET"}});
  t.mock.method(globalThis,"fetch",async()=>new Response("API-SECRET HEADER-SECRET",{status:400}));
  await assert.rejects(()=>llmForStage("digest").generate({system:"s",prompt:"p"}),e=>!String(e).includes("SECRET"));
  assert.ok(!db.select().from(schema.llmCalls).all().at(-1)?.error?.includes("SECRET"));
});
test("Gemini 模型目录分页与能力字段保留",async t=>{
  const {p}=target("gemini",{modelsUrl:"https://fixture.invalid/v1beta/models"});let calls=0;
  t.mock.method(globalThis,"fetch",async()=>{calls++;return Response.json({models:[{name:`models/model-${calls}`,displayName:`Model ${calls}`,inputTokenLimit:100000,outputTokenLimit:8000}],...(calls===1?{nextPageToken:"next"}:{})});});
  const models=await listRemoteModels(p);assert.equal(models.length,2);assert.equal(models[0].modelId,"model-1");assert.equal(models[0].contextWindow,100000);assert.equal(models[0].maxOutputTokens,8000);
});

test("四种协议都把图片随提示一起发送", async (t) => {
  const images = [{ mediaType: "image/jpeg" as const, data: "QUJD" }];
  const cases: { protocol: Protocol; check: (b: any) => void; reply: Response | (() => Response) }[] = [
    { protocol: "openai", check: (b) => assert.deepEqual(b.messages[1].content[1], { type: "image_url", image_url: { url: "data:image/jpeg;base64,QUJD" } }), reply: () => sse([{ choices: [{ delta: { content: "ok" }, finish_reason: "stop" }], usage: { prompt_tokens: 1, completion_tokens: 1 } }]) },
    { protocol: "responses", check: (b) => assert.equal(b.input[0].content[1].image_url, "data:image/jpeg;base64,QUJD"), reply: () => sse([{ type: "response.output_text.delta", delta: "ok" }, { type: "response.completed", response: { status: "completed", usage: { input_tokens: 1, output_tokens: 1 } } }]) },
    { protocol: "gemini", check: (b) => assert.deepEqual(b.contents[0].parts[1], { inlineData: { mimeType: "image/jpeg", data: "QUJD" } }), reply: () => Response.json({ candidates: [{ content: { parts: [{ text: "ok" }] }, finishReason: "STOP" }] }) },
    {
      protocol: "anthropic",
      check: (b) => assert.deepEqual(b.messages[0].content[0], { type: "image", source: { type: "base64", media_type: "image/jpeg", data: "QUJD" } }),
      reply: () => sse([
        { type: "message_start", message: { id: "m", type: "message", role: "assistant", model: "x", content: [], stop_reason: null, usage: { input_tokens: 1, output_tokens: 0 } } },
        { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
        { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "ok" } },
        { type: "content_block_stop", index: 0 },
        { type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: 1 } },
        { type: "message_stop" },
      ]),
    },
  ];
  for (const c of cases) {
    target(c.protocol, { reasoning: "off" });
    let seen = false;
    const mock = t.mock.method(globalThis, "fetch", async (_: unknown, init?: RequestInit) => {
      c.check(JSON.parse(String(init?.body)));
      seen = true;
      return typeof c.reply === "function" ? c.reply() : c.reply;
    });
    assert.equal(await llmForStage("chat").generate({ system: "s", prompt: "p", images }), "ok", c.protocol);
    assert.ok(seen, c.protocol);
    mock.mock.restore();
  }
});
