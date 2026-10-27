// Isolated fixture only; never saves to the service on port 3000.
import assert from "node:assert/strict";
import fs from "node:fs";
import { chromium } from "playwright-core";
import { sealData } from "iron-session";
import ts from "typescript";
import vm from "node:vm";

process.loadEnvFile(".env");
const base=process.env.MODEL_UI_BASE??"http://localhost:3101";
const browser=await chromium.launch({executablePath:"apps/worker/node_modules/.remotion/chrome-headless-shell/win64/chrome-headless-shell-win64/chrome-headless-shell.exe"});
const context=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:"reduce"});
await context.addCookies([{name:"paper_session",value:await sealData({loggedIn:true},{password:process.env.SESSION_SECRET!}),url:base}]);
const page=await context.newPage();const errors:string[]=[];page.on("pageerror",e=>errors.push(e.message));
const post=async(data:object,status=200)=>{const r=await context.request.post(`${base}/api/admin/models`,{headers:{origin:base},data});assert.equal(r.status(),status,await r.text());return r.json();};
const state=async()=>(await(await context.request.get(`${base}/api/admin/models`)).json()).data;
const modal=()=>page.locator("dialog[open]");
fs.mkdirSync("data/model-layout-review",{recursive:true});
try {
  // Verify every manifest entry resolves, including imported raster brand marks.
  const out:any={};vm.runInNewContext(ts.transpileModule(fs.readFileSync("packages/core/src/llm/icon-assets.ts","utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports:out});
  for(const asset of Object.values(out.ICON_ASSETS) as {file:string}[])assert.ok(fs.existsSync(`apps/web/public/llm-icons/${asset.file}`),asset.file);
  const anon=await browser.newContext();
  for(const path of ["/favicon.ico","/icon.svg","/apple-icon.png"]){const r=await anon.request.get(base+path);assert.equal(r.status(),200);assert.match(r.headers()["content-type"],/image/);}
  await anon.close();
  await page.goto(base+"/admin/models",{waitUntil:"networkidle"});
  assert.ok(await page.locator('link[rel="icon"]').count()>0);
  for(const width of [1440,1024,768,390,320]) {
    await page.setViewportSize({width,height:900});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,`providers ${width}`);
    await page.screenshot({path:`data/model-layout-review/providers-${width}.png`,fullPage:true,animations:"disabled"});
    await page.getByRole("button",{name:"添加服务商",exact:true}).click();
    const search=modal().getByRole("textbox",{name:"搜索服务商，如 DeepSeek、Codex",exact:true});
    await search.fill("");await modal().getByRole("button",{name:"全部",exact:true}).click();
    assert.equal(await modal().locator(".catalog-results").evaluate(el=>el.scrollWidth>el.clientWidth+1),false,`catalog ${width}`);
    await page.screenshot({path:`data/model-layout-review/catalog-${width}.png`,animations:"disabled"});
    await search.fill("ant-ling.com");assert.equal(await modal().locator(".catalog-section .catalog-provider").count(),1);
    await modal().getByRole("button",{name:"模型厂商",exact:true}).click();
    await search.fill("no-such-provider-987654");await modal().getByText("没有匹配的服务商",{exact:true}).waitFor();
    await search.fill("Kimi");await modal().getByRole("button",{name:/^Kimi /}).click();
    const version=modal().locator("label").filter({hasText:"服务版本"}).locator("button[aria-haspopup=listbox]");
    assert.ok(!(await version.innerText()).includes("服务版本"));
    await version.click();const option=page.getByRole("option").last();const label=await option.innerText();await option.click();
    assert.equal(await modal().locator('input[name="name"]').inputValue(),label);
    await modal().getByText("高级设置",{exact:true}).click();
    assert.equal(await modal().evaluate(el=>el.scrollWidth>el.clientWidth+1),false,`form ${width}`);
    const footer=await modal().locator("footer").boundingBox();assert.ok(footer&&footer.y+footer.height<=901);
    await page.screenshot({path:`data/model-layout-review/connection-${width}.png`,animations:"disabled"});
    await modal().getByRole("button",{name:"返回",exact:true}).click();
    assert.equal(await search.inputValue(),"Kimi");
    assert.equal(await modal().getByRole("button",{name:"模型厂商",exact:true}).getAttribute("aria-pressed"),"true");
    await page.keyboard.press("Escape");await modal().waitFor({state:"detached"});
    assert.equal(await page.getByRole("button",{name:"添加服务商",exact:true}).evaluate(el=>el===document.activeElement),true);
  }
  await page.setViewportSize({width:1440,height:900});
  // Cosmetic icon updates preserve the credentials, existing successful verification and policy.
  const before=await state();const p=before.providers.find((p:any)=>p.name==="CC Port Headers");assert.ok(p);
  const model=before.models.find((m:any)=>m.providerId===p.id);assert.equal(model.verification.status,"passed");
  await page.reload({waitUntil:"networkidle"});
  const card=page.getByRole("region",{name:p.name,exact:true});
  await card.locator(".mw-provider-head").click();
  await modal().getByText("高级设置",{exact:true}).click();await modal().locator("label").filter({hasText:"服务商图标"}).locator("button[aria-haspopup=listbox]").click();
  await page.getByRole("option",{name:"BaiLing",exact:true}).click();
  await modal().getByRole("button",{name:"保存修改",exact:true}).click();await modal().waitFor({state:"detached"});
  const after=await state();assert.equal(after.providers.find((v:any)=>v.id===p.id).customIcon,"bailing");
  assert.equal(after.models.find((v:any)=>v.id===model.id).verification.status,"passed");
  assert.deepEqual(after.policy,before.policy);assert.deepEqual(after.providers.find((v:any)=>v.id===p.id).headerNames,p.headerNames);
  await post({action:"save-provider",id:p.id,preset:p.preset,name:p.name,protocol:p.protocol,baseUrl:p.baseUrl,apiKey:"",icon:"../../invalid"},400);
  await card.locator(".mw-provider-head").click();
  await modal().getByText("高级设置",{exact:true}).click();await modal().locator("label").filter({hasText:"服务商图标"}).locator("button[aria-haspopup=listbox]").click();
  const icons=await page.getByRole("option").locator("img").evaluateAll(async imgs=>{await Promise.all(imgs.map(img=>{const i=img as HTMLImageElement;return i.complete?Promise.resolve():new Promise<void>(resolve=>{i.onload=()=>resolve();i.onerror=()=>resolve();});}));return imgs.filter(img=>!(img as HTMLImageElement).naturalWidth).map(img=>(img as HTMLImageElement).src);});
  assert.deepEqual(icons,[]);await page.keyboard.press("Escape");await page.keyboard.press("Escape");
  const local=await post({action:"save-provider",preset:"custom",name:"Layout No Auth",protocol:"openai",baseUrl:"http://127.0.0.1:3102/v1",apiKey:"",options:{authMode:"none"}});
  try {
    await page.reload({waitUntil:"networkidle"});
    await page.getByRole("region",{name:"Layout No Auth",exact:true}).locator(".mw-provider-head").click();
    await modal().locator('input[name="name"]').fill("Layout No Auth Renamed");
    await modal().getByRole("button",{name:"保存修改",exact:true}).click();await modal().waitFor({state:"detached"});
    assert.equal((await state()).providers.find((p:any)=>p.id===local.selectedId).options.authMode,"none");
  } finally {await post({action:"delete-provider",id:local.selectedId});}
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({viewportWidths:[1440,1024,768,390,320],registeredIcons:Object.keys(out.ICON_ASSETS).length,brokenIcons:icons,checks:["分类/网址搜索/空状态","版本切换/返回保留筛选","默认服务商目录/移动端无溢出/固定操作栏","Esc焦点恢复","图标保存不影响密钥、验证和工作流","非法图标拒绝","未登录favicon可访问"]},null,2));
} finally {await browser.close();}
