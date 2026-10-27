// Requires the isolated DATA_DIR=data/ui-policy-fixture service on port 3101.
// No production credentials or external model endpoints are used.
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import { randomUUID } from "node:crypto";
import { chromium } from "playwright-core";
import { sealData } from "iron-session";

process.loadEnvFile(".env");
const base=process.env.MODEL_UI_BASE??"http://localhost:3101";
let modelCalls=0;
const mock=http.createServer(async(req,res)=>{
  if(req.url==="/models"){res.writeHead(200,{"content-type":"application/json"});res.end(JSON.stringify({data:[{id:"remote-model",display_name:"Remote Model",max_tokens:8192}]}));return;}
  if(req.url==="/full-chat?api-version=1"){
    assert.equal(req.headers["api-key"],"CC-HEADER-SECRET");
    let raw="";for await(const chunk of req)raw+=chunk;assert.equal(JSON.parse(raw).model,"upstream-deployment");modelCalls++;
    res.writeHead(200,{"content-type":"text/event-stream"});res.end(`data: ${JSON.stringify({choices:[{delta:{content:"连接成功"},finish_reason:"stop"}],usage:{prompt_tokens:1,completion_tokens:1}})}\n\ndata: [DONE]\n\n`);return;
  }
  res.writeHead(404);res.end("not found");
});
await new Promise<void>(resolve=>mock.listen(3102,"127.0.0.1",resolve));
const browser=await chromium.launch({executablePath:"apps/worker/node_modules/.remotion/chrome-headless-shell/win64/chrome-headless-shell-win64/chrome-headless-shell.exe"});
const context=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:"reduce"});
await context.addCookies([{name:"paper_session",value:await sealData({loggedIn:true},{password:process.env.SESSION_SECRET!}),url:base}]);
const page=await context.newPage();const errors:string[]=[];page.on("pageerror",e=>errors.push(e.message));
const post=async(body:object,status=200)=>{const r=await context.request.post(`${base}/api/admin/models`,{headers:{origin:base},data:body});assert.equal(r.status(),status,await r.text());return r.json();};
const state=async()=>(await(await context.request.get(`${base}/api/admin/models`)).json()).data;
const passed:string[]=[];
try{
  for(const provider of (await state()).providers.filter((p:any)=>p.name.startsWith("CC Port "))) await post({action:"delete-provider",id:provider.id});
  const before=(await state()).policy;
  const r=await post({action:"save-provider",preset:"custom",name:"CC Port Headers",protocol:"openai",baseUrl:"http://127.0.0.1:3102/full-chat?api-version=1",apiKey:"",options:{authMode:"none",fullUrl:true,modelsUrl:"http://127.0.0.1:3102/models",headers:{"api-key":"CC-HEADER-SECRET"}}});
  const providerId=r.selectedId;assert.ok(!JSON.stringify(r).includes("CC-HEADER-SECRET"));
  const remote=await post({action:"remote-models",id:providerId});assert.equal(remote.models[0].maxOutputTokens,8192);
  const added=await post({action:"add-models",id:providerId,models:["local-alias"],metadata:[{modelId:"local-alias",contextWindow:128000,maxOutputTokens:8192}]});
  const modelId=added.addedModelIds[0];let model=added.data.models.find((m:any)=>m.id===modelId);assert.equal(model.maxOutputTokens,8192);assert.equal(model.contextWindow,128000);
  await post({action:"save-model",id:modelId,displayName:"Alias",upstreamModelId:"upstream-deployment",contextWindow:128000,maxOutputTokens:8192,effort:null,priceInput:null,priceOutput:null});
  await post({action:"test",id:modelId});assert.equal(modelCalls,1);
  await post({action:"save-provider",id:providerId,preset:"custom",name:"CC Port Headers",protocol:"openai",baseUrl:"http://127.0.0.1:3102/full-chat?api-version=1",apiKey:"",options:{reasoning:"off"}});
  await post({action:"test",id:modelId});assert.equal(modelCalls,2);assert.deepEqual((await state()).policy,before);
  passed.push("四种格式配置、完整端点、独立模型目录、能力元数据、别名真实请求、自定义头保存与脱敏、工作流保持不变");
  await page.goto(`${base}/admin/models`,{waitUntil:"networkidle"});
  await page.getByRole("button",{name:"添加服务商",exact:true}).click();let dialog=page.locator("dialog[open]");
  await dialog.getByRole("textbox",{name:"搜索服务商，如 DeepSeek、Codex",exact:true}).fill("Kimi");await dialog.locator("button.catalog-provider").filter({has:page.locator("strong").filter({hasText:/^Kimi$/})}).click();await dialog.getByText("服务版本",{exact:true}).waitFor();await dialog.locator("label").filter({hasText:"服务版本"}).locator("button[aria-haspopup=listbox]").click();assert.ok(await page.getByRole("option").count()>1);await page.keyboard.press("Escape");
  fs.mkdirSync("data/cc-switch-review",{recursive:true});await page.screenshot({path:"data/cc-switch-review/family-variants.png",animations:"disabled"});await page.keyboard.press("Escape");
  await page.getByRole("button",{name:"添加服务商",exact:true}).click();dialog=page.locator("dialog[open]");await dialog.getByRole("textbox",{name:"搜索服务商，如 DeepSeek、Codex",exact:true}).fill("custom");await dialog.getByRole("button",{name:/自定义/}).click();await dialog.locator('input[name="name"]').waitFor();
  for(const width of [1440,390,320]){await page.setViewportSize({width,height:900});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);const footer=await dialog.locator("footer").boundingBox();assert.ok(footer && footer.y+footer.height<=901);await page.screenshot({path:`data/cc-switch-review/provider-form-${width}.png`,animations:"disabled"});}
  await page.keyboard.press("Escape");await page.setViewportSize({width:390,height:844});
  const section=page.getByRole("region",{name:"CC Port Headers",exact:true});
  await section.getByRole("button",{name:"添加模型",exact:true}).click();dialog=page.locator("dialog[open]");await dialog.getByText("批量添加",{exact:true}).click();await dialog.locator("textarea").fill("batch-a\nbatch-b");await dialog.getByRole("button",{name:"保存批量模型",exact:true}).click();await dialog.getByRole("status").waitFor();assert.equal(modelCalls,2);await page.keyboard.press("Escape");
  assert.deepEqual(errors,[]);passed.push("厂商变体选择、桌面/390px/320px弹窗无溢出且底部操作可见、批量保存不自动调用模型");
  fs.writeFileSync("data/cc-switch-review/checks.json",JSON.stringify({passed,localModelCalls:modelCalls},null,2));console.log(JSON.stringify({passed,localModelCalls:modelCalls},null,2));
}finally{await browser.close();await new Promise<void>(resolve=>mock.close(()=>resolve()));}
