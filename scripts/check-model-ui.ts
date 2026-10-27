// 在 DATA_DIR=data/ui-policy-fixture 的 3101 服务上运行；推理全部指向本机假服务。
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import Database from "better-sqlite3";
import { chromium } from "playwright-core";
import { sealData } from "iron-session";

process.loadEnvFile(".env");
const base=process.env.MODEL_UI_BASE??"http://localhost:3101";
await fetch(`${base}/login`);
assert.ok(fs.existsSync("data/ui-policy-fixture/app.db"),"必须使用独立测试服务");
const fixture=new Database("data/ui-policy-fixture/app.db");
fixture.prepare("DELETE FROM runs").run();fixture.prepare("DELETE FROM llm_models").run();fixture.prepare("DELETE FROM llm_providers").run();fixture.prepare("DELETE FROM settings WHERE key='modelPolicy' OR key LIKE 'modelVerification:%' OR key LIKE 'providerRequest:%'").run();
let modelCalls=0;
const mock=http.createServer(async(req,res)=>{
  let text="";for await(const chunk of req)text+=chunk;
  const body=text?JSON.parse(text):{};
  if(req.method==="GET"){res.setHeader("content-type","application/json");res.end(JSON.stringify({data:[{id:"ui-chat"},{id:"fails-model"},{id:"slow-model"}]}));return;}
  modelCalls++;
  if(body.model==="slow-model")await new Promise(r=>setTimeout(r,2000));
  if(body.model==="fails-model"){res.writeHead(400,{"content-type":"application/json"});res.end(JSON.stringify({error:{message:"模拟模型权限不足"}}));return;}
  res.writeHead(200,{"content-type":"text/event-stream"});
  res.end(`data: ${JSON.stringify({choices:[{delta:{content:"连接成功"},finish_reason:null}]})}\n\ndata: ${JSON.stringify({choices:[{delta:{},finish_reason:"stop"}],usage:{prompt_tokens:2,completion_tokens:2}})}\n\ndata: [DONE]\n\n`);
});
await new Promise<void>(r=>mock.listen(3102,"127.0.0.1",r));
const browser=await chromium.launch({executablePath:"apps/worker/node_modules/.remotion/chrome-headless-shell/win64/chrome-headless-shell-win64/chrome-headless-shell.exe"});
const context=await browser.newContext({viewport:{width:1440,height:1000}});
await context.addCookies([{name:"paper_session",value:await sealData({loggedIn:true},{password:process.env.SESSION_SECRET!}),url:base}]);
const page=await context.newPage();
const errors:string[]=[];const passed:string[]=[];
page.on("pageerror",e=>errors.push(e.message));
page.on("console",m=>{if(m.type()==="error"&&!/status of (400|409|403|401)/.test(m.text()))errors.push(m.text());});
page.on("dialog",async d=>{errors.push(`Browser dialog: ${d.type()}`);await d.dismiss();});
const post=async(data:object,status=200)=>{const res=await context.request.post(`${base}/api/admin/models`,{headers:{origin:base},data});assert.equal(res.status(),status,await res.text());return res.json();};
const snapshot=async()=>(await(await context.request.get(`${base}/api/admin/models`)).json()).data;
const modal=()=>page.locator("dialog:modal");
const close=async(method="button")=>{if(method==="button")await page.getByRole("button",{name:"关闭弹窗",exact:true}).click();else if(method==="escape")await page.keyboard.press("Escape");else await page.mouse.click(20,400);await page.locator("dialog[open]").waitFor({state:"detached"});};
// 单页：服务商分组在上、工作流在下；行内无按钮，点服务商标题或模型行打开弹窗
const providers=async()=>{await page.getByRole("heading",{name:"服务商",exact:true}).scrollIntoViewIfNeeded();};
const workflow=async()=>{await page.getByRole("heading",{name:"工作流",exact:true}).scrollIntoViewIfNeeded();};
const section=async(name:string)=>{const s=page.getByRole("region",{name,exact:true});await s.waitFor();return s;};
const stage=(name:string)=>page.locator(".mw-stage-row").filter({has:page.locator(".mw-stage-name",{hasText:name})});
const choose=async(id:string)=>{await modal().getByRole("textbox",{name:"搜索模型名称、ID 或服务商",exact:true}).fill(id);await modal().locator("button.mw-choice").filter({hasText:id}).click();};
try{
  const anon=await browser.newContext();await anon.addCookies([{name:"paper_session",value:"bad",url:base}]);assert.equal((await anon.request.get(`${base}/api/admin/models`)).status(),401);await anon.close();
  assert.equal((await context.request.post(`${base}/api/admin/models`,{headers:{origin:"https://other.invalid"},data:{action:"refresh"}})).status(),403);
  const create=async(name:string,preset="custom",protocol="openai")=>post({action:"save-provider",preset,name,protocol,apiKey:preset==="codex"?"":"UI-SECRET",baseUrl:preset==="codex"?"":"http://127.0.0.1:3102/v1"});
  const aid=(await create("DeepSeek","deepseek")).selectedId;
  const bid=(await create("备用服务商")).selectedId;
  const cid=(await create("ChatGPT 订阅","codex","codex")).selectedId;
  await post({action:"add-models",id:aid,models:["deepseek-chat","slow-model"]});await post({action:"add-models",id:bid,models:["ui-backup"]});
  let state=await snapshot();const primary=state.models.find((m:any)=>m.modelId==="deepseek-chat").id;const backup=state.models.find((m:any)=>m.modelId==="ui-backup").id;
  assert.equal(state.policy.confirmed,false);assert.equal(state.policy.defaultModelId,null);assert.ok(!JSON.stringify(state).includes("UI-SECRET"));
  fixture.prepare("INSERT INTO settings(key,value) VALUES('stages',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(JSON.stringify({rerank:{modelId:primary,fallbackModelId:null},digest:{modelId:primary,fallbackModelId:null},storyboard:{modelId:null,fallbackModelId:null}}));
  passed.push("认证、同源校验、升级保留服务商且不推断默认、凭据不回传");

  await page.goto(`${base}/admin/models`,{waitUntil:"networkidle"});
  await page.getByRole("heading",{name:"模型配置",exact:true}).waitFor();
  await workflow();assert.equal(await page.locator(".mw-stage-row:not(.is-default)").count(),4);
  let navigations=0;page.on("request",r=>{if(r.isNavigationRequest()||r.url().includes("_rsc="))navigations++;});
  await page.getByRole("button",{name:"选择默认模型",exact:true}).click();
  await modal().locator("button.mw-choice").first().click();await choose("deepseek-chat");
  assert.equal((await snapshot()).policy.defaultModelId,null,"选择不应立即保存");
  await modal().getByRole("button",{name:"保存修改",exact:true}).click();await modal().waitFor({state:"detached"});
  assert.equal((await snapshot()).policy.defaultModelId,primary);
  passed.push("四环节摘要、默认模型明确保存、首次确认升级");

  await page.locator(".mw-stage-row.is-default").click();
  await modal().locator("button.mw-choice").first().click();await choose("ui-backup");await close();
  await page.locator(".mw-stage-row.is-default").click();
  await modal().getByText("已恢复未保存草稿，继续编辑",{exact:true}).waitFor();assert.ok(await modal().locator("button.mw-choice").first().textContent().then(t=>t?.includes("ui-backup")));
  assert.equal((await snapshot()).policy.defaultModelId,primary);
  await modal().getByRole("button",{name:"放弃草稿",exact:true}).click();
  await modal().getByRole("button",{name:"指定模型",exact:true}).click();await modal().locator("button.mw-choice").nth(1).click();await choose("ui-backup");
  await modal().getByRole("button",{name:"保存修改",exact:true}).click();await modal().waitFor({state:"detached"});
  await stage("论文解读").click();await modal().getByRole("button",{name:"不使用",exact:true}).click();await modal().getByRole("button",{name:"保存修改",exact:true}).click();await modal().waitFor({state:"detached"});
  await stage("趋势月报").click();await modal().getByRole("button",{name:"单独指定",exact:true}).click();await modal().getByRole("button",{name:"不使用",exact:true}).click();await modal().locator("button.mw-choice").first().click();await choose("ui-backup");await modal().getByRole("button",{name:"保存修改",exact:true}).click();await modal().waitFor({state:"detached"});
  state=await snapshot();assert.equal(state.resolved.digest.fallbackId,null);assert.equal(state.resolved.report.primaryId,backup);assert.equal(state.resolved.rerank.fallbackId,backup);
  passed.push("默认草稿恢复与放弃、全局备用继承、显式关闭备用、月报独立覆盖");

  await providers();await (await section("DeepSeek")).locator(".mw-provider-head").click();await modal().locator('input[name="name"]').fill("服务商草稿");await close("escape");
  await (await section("DeepSeek")).locator(".mw-provider-head").click();assert.equal(await modal().locator('input[name="name"]').inputValue(),"服务商草稿");await modal().getByRole("button",{name:"放弃草稿",exact:true}).click();await modal().locator('input[name="name"]').fill("");await modal().getByRole("button",{name:"保存修改",exact:true}).click();await modal().getByText("请输入服务商名称",{exact:true}).waitFor();await close();
  passed.push("服务商弹窗恢复草稿、字段就近报错、关闭不弹浏览器确认");

  await page.getByRole("button",{name:"添加服务商",exact:true}).click();await modal().getByRole("textbox",{name:"搜索服务商，如 DeepSeek、Codex",exact:true}).fill("custom");await modal().getByRole("button",{name:/自定义/}).click();
  await modal().locator('input[name="name"]').fill("新增测试服务商");await modal().locator('input[name="apiKey"]').fill("UI-NEW-SECRET");await modal().locator('input[name="baseUrl"]').fill("http://127.0.0.1:3102/v1");await modal().getByRole("button",{name:"添加服务商",exact:true}).click();await modal().waitFor({state:"detached"});
  const savedState=await snapshot();const count=savedState.providers.length;const addedProvider=savedState.providers.find((p:any)=>p.name==="新增测试服务商");assert.ok(addedProvider);assert.equal(savedState.models.filter((m:any)=>m.providerId===addedProvider.id).length,0);await page.getByRole("button",{name:"添加服务商",exact:true}).click();await modal().getByRole("textbox",{name:"搜索服务商，如 DeepSeek、Codex",exact:true}).waitFor();assert.equal((await snapshot()).providers.length,count);await close();await (await section("新增测试服务商")).getByRole("button",{name:"添加模型",exact:true}).click();
  await modal().getByRole("textbox",{name:"模型 ID",exact:true}).fill("ui-chat");const before=modelCalls;await modal().getByRole("button",{name:"添加并测试",exact:true}).click();await modal().getByText(/验证通过 ·/).waitFor();assert.equal(modelCalls,before+1);
  await modal().getByRole("button",{name:"设为默认",exact:true}).click();await modal().waitFor({state:"detached"});state=await snapshot();assert.equal(state.models.find((m:any)=>m.id===state.policy.defaultModelId).modelId,"ui-chat");
  passed.push("添加服务商后直接回到页面且不创建模型、重开回到目录、从页面添加模型并验证、设为默认");

  await providers();const newSection=await section("新增测试服务商");await newSection.getByRole("button",{name:"添加模型",exact:true}).click();await modal().getByRole("textbox",{name:"模型 ID",exact:true}).fill("fails-model");await modal().getByRole("button",{name:"添加并测试",exact:true}).click();await modal().locator(".mw-dialog-body").getByText(/模拟模型权限不足/).waitFor();await modal().getByRole("button",{name:"完成",exact:true}).click();await modal().waitFor({state:"detached"});assert.equal((await snapshot()).models.find((m:any)=>m.modelId==="fails-model").verification.status,"failed");
  await newSection.locator(".mw-provider-head").click();await modal().locator('input[name="apiKey"]').fill("UI-ROTATED");await modal().getByRole("button",{name:"保存修改",exact:true}).click();await modal().waitFor({state:"detached"});for(let i=0;i<50&&(await snapshot()).models.find((m:any)=>m.modelId==="ui-chat").verification.status!=="passed";i++)await page.waitForTimeout(100);state=await snapshot();assert.equal(state.models.find((m:any)=>m.modelId==="ui-chat").verification.status,"passed");assert.equal(state.models.find((m:any)=>m.modelId==="fails-model").verification.status,"stale");
  passed.push("自动验证失败可跳过、模型仍保留，修改凭据后在用模型自动重测、其余模型验证过期");

  let slow=false;await page.route("**/api/admin/models",async route=>{const c=route.request().postDataJSON();if(slow&&c?.action==="remote-models"){await new Promise(r=>setTimeout(r,2400));await route.fulfill({json:{models:[{modelId:"late-model"}]}}).catch(()=>{});}else if(c?.action==="oauth-start"){await route.fulfill({status:400,json:{error:"模拟授权服务不可用"}});}else await route.continue();});
  slow=true;const times:number[]=[];
  for(const method of ["button","escape","backdrop"]){await (await section("DeepSeek")).getByRole("button",{name:"添加模型",exact:true}).click();await modal().waitFor();const start=performance.now();await close(method);times.push(Math.round(performance.now()-start));}
  await (await section("DeepSeek")).locator(".mw-provider-head").click();await page.waitForTimeout(2500);await modal().getByRole("heading",{name:"编辑服务商",exact:true}).waitFor();await close();assert.ok(times.every(n=>n<1000),JSON.stringify(times));slow=false;
  passed.push(`慢网关闭按钮/Esc/遮罩 ${times.join("/")}ms，迟到列表不干扰新弹窗`);

  const slowRow=(await section("DeepSeek")).locator(".mw-model-row").filter({hasText:"slow-model"});await slowRow.click();await modal().getByRole("button",{name:"测试连接",exact:true}).click();await close();await (await section("DeepSeek")).locator(".mw-provider-head").click();await modal().getByRole("heading",{name:"编辑服务商",exact:true}).waitFor();await close();await workflow();await page.getByRole("heading",{name:"工作流",exact:true}).waitFor();await providers();
  const codex=await section("ChatGPT 订阅");await codex.getByRole("button",{name:"登录账号",exact:true}).click();await modal().getByRole("button",{name:"使用设备码登录",exact:true}).click();await modal().getByText("模拟授权服务不可用",{exact:true}).waitFor();assert.ok(await modal().getByRole("button",{name:"使用设备码登录",exact:true}).isEnabled());await close();
  passed.push("验证进行时可继续编辑服务商，授权失败保留流程并可退出重试");

  // 删除不静默清理分配，失效项必须显示给用户。
  state=await snapshot();const current=state.policy.defaultModelId;await post({action:"delete-model",id:current});state=await snapshot();assert.equal(state.policy.defaultModelId,current);assert.ok(state.resolved.rerank.issues.length>0);
  const reset=await post({action:"defaults",defaultModelId:primary,fallbackModelId:backup,revision:state.policy.revision});assert.ok(reset.data.policy.confirmed);
  assert.equal(navigations,0,"切换与编辑不应触发整页导航或 RSC 刷新");
  await page.reload({waitUntil:"networkidle"});await workflow();assert.equal(await page.locator(".mw-stage-row:not(.is-default)").filter({hasText:"沿用默认"}).count(),3); // report 有覆盖
  passed.push("删除保留失效引用并明确报错，不静默换模型；刷新保持已保存分配");

  fs.mkdirSync("data/ui-check",{recursive:true});await page.screenshot({path:"data/ui-check/policy-workflow-desktop.png",fullPage:true,animations:"disabled"});await providers();await page.screenshot({path:"data/ui-check/policy-providers-desktop.png",fullPage:true,animations:"disabled"});
  await page.getByRole("button",{name:"添加服务商",exact:true}).click();await modal().waitFor();await page.screenshot({path:"data/ui-check/policy-provider-dialog.png",animations:"disabled"});
  for(const width of [1440,390,320]){await page.setViewportSize({width,height:900});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));const box=await modal().locator(".mw-search").evaluate(el=>{const a=el.querySelector("svg")!.getBoundingClientRect();const b=el.querySelector("input")!.getBoundingClientRect();return {gap:b.left-a.right,width:b.width};});assert.ok(box.gap>=8&&box.width>80,JSON.stringify(box));}
  await page.screenshot({path:"data/ui-check/policy-mobile-dialog.png",animations:"disabled"});await close();await page.setViewportSize({width:390,height:844});await workflow();await page.screenshot({path:"data/ui-check/policy-workflow-mobile.png",fullPage:true,animations:"disabled"});await page.evaluate(()=>{document.documentElement.style.zoom="125%";});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.evaluate(()=>{document.documentElement.style.zoom="";});
  assert.deepEqual(errors,[]);
  passed.push("桌面/390px/320px/125%缩放无横向溢出，搜索图标与输入不重叠，无运行时错误及整页刷新");
  console.log(JSON.stringify({passed,localModelCalls:modelCalls},null,2));
}finally{await browser.close();fixture.close();mock.closeAllConnections();await new Promise<void>(r=>mock.close(()=>r()));}
