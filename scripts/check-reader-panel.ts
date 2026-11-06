/** Isolated reader regression. No production writes or external model calls.
 * Run: node --import tsx scripts/check-reader-panel.ts
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import Database from "better-sqlite3";
import { chromium, type Locator } from "playwright-core";
import { sealData } from "iron-session";
import { READING_CONVERSATION_TITLE_SYSTEM } from "../packages/core/src/prompts/assistant";

const root = process.cwd();
const nextEnvFile = path.join(root, "apps/web/next-env.d.ts");
const originalNextEnv = fs.existsSync(nextEnvFile) ? fs.readFileSync(nextEnvFile, "utf8").replaceAll(".next-reader-panel-check/", ".next/") : null;
const fixture = fs.mkdtempSync(path.join(root, "data/reader-panel-fixture-"));
const port = Number(process.env.READER_TEST_PORT ?? 3106);
const base = `http://127.0.0.1:${port}`;
const sessionSecret = "reader-fixture-only-session-secret-12345678";
process.env.DATA_DIR = fixture;
process.env.SESSION_SECRET = sessionSecret;
process.env.SITE_URL = base;
const { db, schema } = await import("../packages/core/src/db/index");
const { getModelPolicy, saveModelPolicy } = await import("../packages/core/src/model-policy");
const source = new Database(path.join(root, "data/app.db"), { readonly: true });
const target = new Database(path.join(fixture, "app.db"));
// Copy public reading material only. Never copy providers, credentials, notes or conversations.
for (const table of ["papers", "digests", "digest_revisions", "figures", "videos", "tags", "digest_tags", "trend_reports"]) {
  const rows = source.prepare(`SELECT * FROM ${table}`).all() as Record<string, unknown>[];
  for (const row of rows) {
    const keys = Object.keys(row);
    target.prepare(`INSERT INTO ${table} (${keys.map(k => `"${k}"`).join(",")}) VALUES (${keys.map(() => "?").join(",")})`).run(...keys.map(k => row[k]));
  }
}
const paper = target.prepare("SELECT paper_id FROM digests ORDER BY created_at DESC LIMIT 1").get() as { paper_id: string };
assert.ok(paper, "Need an existing public digest for the isolated fixture");
const paperId = paper.paper_id;
const secondPaperId = "reader-panel-fixture";
const reportMonth = "2026-09";
db.insert(schema.trendReports).values({ month: reportMonth, title: "月报阅读工作台回归", contentMd: "## 研究趋势\n这是月报工作台的隔离测试内容。\n\n## 研究联系\n检验月报的助手与笔记独立保存。" }).onConflictDoNothing().run();
const originalPaper = db.select().from(schema.papers).get()!;
const originalDigest = db.select().from(schema.digests).get()!;
db.insert(schema.papers).values({ ...originalPaper, id: secondPaperId, title: "Reader window fixture" }).run();
const highlightLatex = "\\mathcal{A}=\\mathcal{A}_{\\mathrm{GUI}}\\cup\\mathcal{A}_{\\mathrm{API}}";
db.insert(schema.digests).values({ ...originalDigest, id: undefined, paperId: secondPaperId, revisionId: null, titleZh: "窗口偏好回归用解读", contentMd: originalDigest.contentMd + `\n\n## 高亮公式回归\n\n高亮公式起始：$${highlightLatex}$，高亮公式结束。` }).run();
db.insert(schema.candidates).values({ runId: originalDigest.runId, paperId: secondPaperId, role: "alternate", ruleScore: 0, reason: "论文信息内的同期论文回归样例" }).run();
const media = [...target.prepare("SELECT path FROM figures").all(), ...target.prepare("SELECT path FROM videos").all()] as { path: string }[];
for (const { path: rel } of media) {
  const original = path.resolve(root, "data", rel), dest = path.resolve(fixture, rel);
  if (original.startsWith(path.resolve(root, "data") + path.sep) && dest.startsWith(fixture + path.sep) && fs.existsSync(original)) {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    if (!fs.existsSync(dest)) { try { fs.linkSync(original, dest); } catch { fs.copyFileSync(original, dest); } }
  }
}
source.close();
let modelCalls = 0;
const model = createServer(async (req, res) => {
  let body = "";
  for await (const chunk of req) body += chunk;
  const fail = body.includes("__fixture_fail__");
  modelCalls++;
  if (fail) { res.writeHead(400, { "content-type": "application/json" }); res.end('{"error":{"message":"fixture failure"}}'); return; }
  await new Promise(resolve => setTimeout(resolve, 1200));
  const naming = JSON.parse(body).messages.some((message: { content: string }) => message.content === READING_CONVERSATION_TITLE_SYSTEM);
  const content = naming ? "拆开研究方法的黑箱" : "这是本地模拟回答，用于验证关闭窗口后请求继续。";
  res.writeHead(200, { "content-type": "text/event-stream" });
  res.end(`data: ${JSON.stringify({ choices: [{ delta: { content }, finish_reason: "stop" }], usage: { prompt_tokens: 1, completion_tokens: 1 } })}\n\ndata: [DONE]\n\n`);
});
await new Promise<void>(resolve => model.listen(0, "127.0.0.1", resolve));
const modelPort = (model.address() as { port: number }).port;
const provider = db.insert(schema.llmProviders).values({ name: "reader-fixture", protocol: "openai", apiKey: "fixture-only", baseUrl: `http://127.0.0.1:${modelPort}/v1`, options: { reasoning: "off" } }).returning().get();
const configured = db.insert(schema.llmModels).values({ providerId: provider.id, modelId: "fixture", effort: null }).returning().get();
saveModelPolicy({ ...getModelPolicy(), confirmed: true, defaultModelId: configured.id });
db.insert(schema.notes).values({ paperId, section: "已不在正文中的旧章节", content: "fixture orphan note" }).run();
const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "apps/web", "--hostname", "127.0.0.1", "--port", String(port)], {
  cwd: root, env: { ...process.env, DATA_DIR: fixture, SESSION_SECRET: sessionSecret, SITE_URL: base, ADMIN_PASSWORD: "fixture-only", NEXT_DIST_DIR: ".next-reader-panel-check", HTTP_PROXY: "", HTTPS_PROXY: "", NEXT_TELEMETRY_DISABLED: "1" }, windowsHide: true, stdio: ["ignore", "pipe", "pipe"],
});
let logs = "";
server.stdout.on("data", b => { logs = (logs + b).slice(-12000); });
server.stderr.on("data", b => { logs = (logs + b).slice(-12000); });
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
try {
  for (let i = 0; i < 120; i++) {
    if (server.exitCode != null) throw new Error(logs);
    try { if ((await fetch(base + "/login")).ok) break; } catch { /* Wait for local dev server. */ }
    await new Promise(resolve => setTimeout(resolve, 500));
    if (i === 119) throw new Error("Fixture server startup timed out\n" + logs);
  }
  browser = await chromium.launch({ executablePath: path.join(root, "apps/worker/node_modules/.remotion/chrome-headless-shell/win64/chrome-headless-shell-win64/chrome-headless-shell.exe") });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
  await context.addCookies([{ name: "paper_session", value: await sealData({ loggedIn: true }, { password: sessionSecret }), url: base }]);
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  const panel = page.locator("#reader-panel"), tools = page.getByRole("navigation", { name: "阅读工具" });
  const goto = () => page.goto(`${base}/papers/${paperId}`, { waitUntil: "networkidle" });
  const waitForNotebookSave = () => page.waitForFunction(() => {
    const notebook = document.querySelector<HTMLElement>(".reader-notebook");
    return notebook?.dataset.saveState === "saved" && localStorage.getItem(`paper-notebook-draft:${notebook.dataset.subjectId}`) === null;
  });
  async function writeNotebook(text: string) {
    await panel.getByRole("textbox", { name: "笔记内容" }).focus();
    await page.keyboard.press("Control+a");
    if (text) await page.keyboard.insertText(text); else await page.keyboard.press("Backspace");
  }
  async function switchView(name: string) { const button = tools.getByRole("button", { name, exact: true }); if (await panel.isVisible() && await button.getAttribute("aria-expanded") === "true") return; await button.click(); }
  async function mode(name: string) { await panel.getByRole("button", { name: "窗口位置", exact: true }).click(); await panel.getByRole("menuitemradio", { name, exact: true }).click(); }
  async function drag(locator: Locator, dx: number, dy: number) {
    const rect = (await locator.boundingBox())!;
    assert.ok(rect);
    await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2);
    await page.mouse.down();
    await page.mouse.move(rect.x + rect.width / 2 + dx, rect.y + rect.height / 2 + dy, { steps: 8 });
    await page.mouse.up();
  }
  async function expectMode(value: string) { await page.waitForFunction(value => document.querySelector("#reader-panel")?.getAttribute("data-mode") === value, value); }
  async function noOverflow() { assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false); }
  await goto();
  assert.equal(await panel.isVisible(), false);
  assert.equal(await page.locator(".reader-sidebar").isVisible(), true);
  assert.equal(await page.locator(".room-header").isVisible(), false);
  assert.ok((await page.locator(".reader-body").boundingBox())!.width <= 761);
  await page.screenshot({ path: path.join(fixture, "reading.png") });
  const displayFormula = page.locator(".reading-sheet .katex-display").first();
  assert.ok(await page.locator(".reading-sheet .katex-display").count() > 0, "Standalone same-line formulas use display layout");
  assert.equal(await displayFormula.evaluate(el => getComputedStyle(el).textAlign), "center");
  await tools.getByRole("button", { name: "AI 助手", exact: true }).hover();
  await page.waitForFunction(() => getComputedStyle(document.querySelector('[data-reader-trigger="qa"]>span')!).opacity === "1");
  await page.screenshot({ path: path.join(fixture, "tooltips.png") });
  const toolPositions = await tools.locator("button").evaluateAll(buttons => buttons.map(button => ({ label: button.getAttribute("aria-label"), x: button.getBoundingClientRect().x, y: button.getBoundingClientRect().y })));
  assert.equal(await page.getByRole("button", { name: "目录", exact: true }).count(), 0);
  const directory = (await page.locator(".reader-sidebar").boundingBox())!, documentContent = (await page.locator(".reader-document-content").boundingBox())!;
  assert.ok(Math.abs(documentContent.x - directory.x - directory.width - 24) < 2, "Directory stays adjacent to the article");
  const readingArea = (await page.locator(".reader-copy").boundingBox())!;
  assert.ok(Math.abs(documentContent.x + documentContent.width / 2 - readingArea.x - readingArea.width / 2) < 2, "Article itself is centred, with its directory to the left");
  await page.evaluate(() => window.scrollTo(0, 1000));
  await tools.getByRole("button", { name: "返回顶部", exact: true }).click();
  await page.waitForFunction(() => window.scrollY === 0);
  await switchView("AI 助手");
  await expectMode("right");
  assert.equal(Math.round((await panel.boundingBox())!.width), 420);
  assert.deepEqual(await tools.locator("button").evaluateAll(buttons => buttons.map(button => ({ label: button.getAttribute("aria-label"), x: button.getBoundingClientRect().x, y: button.getBoundingClientRect().y }))), toolPositions, "Opening embeds the same-position tool rail inside the window");
  assert.equal(await panel.getByRole("navigation", { name: "阅读工具" }).count(), 1);
  const panelBounds = (await panel.boundingBox())!, railBounds = (await tools.boundingBox())!;
  assert.ok(panelBounds.x + panelBounds.width - railBounds.x - railBounds.width >= 16, "Tool rail leaves room for the scroll thumb and active button outline");
  await page.screenshot({ path: path.join(fixture, "docked-top-1440.png") });
  // Native mouse selection must stay stable while dragging and scrolling past a panel.
  const selectionParagraph = page.locator(".reader-body p").first();
  await selectionParagraph.scrollIntoViewIfNeeded();
  const selectionStart = await selectionParagraph.evaluate(el => {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      if ((walker.currentNode.textContent?.trim().length ?? 0) < 12) continue;
      const range = document.createRange();
      range.setStart(walker.currentNode, 0); range.setEnd(walker.currentNode, 12);
      const rect = range.getClientRects()[0];
      return { x: rect.x + 1, y: rect.y + rect.height / 2, width: rect.width };
    }
    throw new Error("Need selectable reading text");
  });
  await page.mouse.move(selectionStart.x, selectionStart.y);
  await page.mouse.down();
  await page.mouse.move(selectionStart.x + selectionStart.width - 1, selectionStart.y, { steps: 8 });
  assert.ok(await page.evaluate(() => window.getSelection()!.toString().length > 0));
  const selectionPopover = page.getByRole("dialog", { name: "选中文字" });
  assert.equal(await selectionPopover.count(), 0, "Do not mount selection UI during a mouse drag");
  for (const delta of [160, -160, 160, -160]) {
    await page.mouse.wheel(0, delta);
    await page.waitForTimeout(80);
    assert.equal(await selectionPopover.count(), 0, "Scrolling during selection does not toggle the toolbar/highlight");
  }
  const selectionPanelBounds = (await panel.boundingBox())!;
  await page.mouse.move(selectionPanelBounds.x + 100, selectionPanelBounds.y + 100, { steps: 8 });
  assert.equal(await panel.evaluate(el => getComputedStyle(el).userSelect), "none", "A body drag cannot paint panel text");
  assert.equal(await page.evaluate(() => {
    const root = document.querySelector(".reader-body")!, selection = window.getSelection()!;
    return root.contains(selection.anchorNode) && root.contains(selection.focusNode);
  }), true, "Crossing the panel keeps both selection endpoints inside the body");
  await page.mouse.up();
  assert.equal(await page.locator(".reader-shell[data-selecting-body]").count(), 0);
  assert.notEqual(await panel.evaluate(el => getComputedStyle(el).userSelect), "none", "Panel text can be selected normally after release");
  await page.evaluate(() => { window.getSelection()?.removeAllRanges(); window.scrollTo(0, 0); });
  await selectionPopover.waitFor({ state: "hidden" });
  await selectionParagraph.scrollIntoViewIfNeeded();
  await page.mouse.move(selectionStart.x, selectionStart.y);
  await page.mouse.down();
  await page.mouse.move(selectionStart.x + selectionStart.width - 1, selectionStart.y, { steps: 8 });
  await page.mouse.up();
  await selectionPopover.waitFor();
  assert.equal(await page.locator(".reader-selection-handle").count(), 2, "Releasing a normal drag shows the toolbar and adjustment handles");
  assert.equal(await selectionPopover.locator("textarea").getAttribute("placeholder"), "针对选中文字提问…");
  const quickExplain = selectionPopover.getByRole("button", { name: "快速解释", exact: true });
  await quickExplain.hover();
  const tooltip = page.getByRole("tooltip");
  await tooltip.getByText("解释选中文字", { exact: true }).waitFor();
  assert.equal(await quickExplain.getAttribute("aria-describedby"), await tooltip.getAttribute("id"));
  assert.equal(await quickExplain.getAttribute("title"), null, "Custom hints do not compete with browser title bubbles");
  const hintBounds = (await tooltip.boundingBox())!;
  assert.ok(hintBounds.x >= 8 && hintBounds.x + hintBounds.width <= 1440 - 8, "The hint stays inside the viewport");
  await page.screenshot({ path: path.join(fixture, "selection-action-tooltip.png") });
  await selectionPopover.getByRole("button", { name: "笔记", exact: true }).click();
  assert.equal(await selectionPopover.locator("textarea").getAttribute("placeholder"), "笔记（可选）");
  await selectionPopover.getByRole("button", { name: "橙色", exact: true }).hover();
  await tooltip.getByText("橙色", { exact: true }).waitFor();
  const saveSelection = selectionPopover.getByRole("button", { name: "保存高亮笔记", exact: true });
  await saveSelection.focus();
  await tooltip.getByText("保存高亮", { exact: true }).waitFor();
  assert.equal(await tooltip.count(), 1, "Mouse hover and keyboard focus share one hint at a time");
  await page.screenshot({ path: path.join(fixture, "selection-note-tooltip.png") });
  await selectionPopover.getByRole("button", { name: "向 AI 提问", exact: true }).click();
  await tooltip.waitFor({ state: "hidden" });
  // Exercise the normal-motion button styles; reduced motion hides active-transform regressions.
  await page.emulateMedia({ reducedMotion: "no-preference" });
  for (const name of ["拖动调整选区起点", "拖动调整选区终点"]) {
    const handle = page.getByRole("button", { name });
    const before = await handle.boundingBox();
    const quote = await page.evaluate(() => window.getSelection()!.toString());
    await handle.hover();
    await page.mouse.down();
    await page.waitForTimeout(220);
    assert.deepEqual(await handle.boundingBox(), before, `${name} stays fixed while pressed`);
    assert.equal(await handle.evaluate(el => getComputedStyle(el).transitionDuration), "0s", "Selection handles track without a position transition");
    await page.mouse.up();
    await page.waitForTimeout(220);
    assert.deepEqual(await handle.boundingBox(), before, `${name} stays fixed after release`);
    assert.equal(await page.evaluate(() => window.getSelection()!.toString()), quote, "Clicking a handle leaves the selected text unchanged");
  }
  for (const [name, dx] of [["拖动调整选区起点", 24], ["拖动调整选区终点", -24]] as const) {
    const handle = page.getByRole("button", { name });
    const bounds = (await handle.boundingBox())!;
    assert.equal(bounds.width, 44);
    assert.equal(bounds.height, 44);
    const before = await page.evaluate(() => window.getSelection()!.toString());
    // Grab well outside the visible dot and the former 18px hit area.
    await page.mouse.move(bounds.x + bounds.width / 2 + 18, bounds.y + bounds.height / 2);
    await page.mouse.down();
    await page.mouse.move(bounds.x + bounds.width / 2 + 18 + dx, bounds.y + bounds.height / 2, { steps: 5 });
    await page.mouse.up();
    const after = await page.evaluate(() => window.getSelection()!.toString());
    assert.ok(after.length > 0 && after.length < before.length, `${name} works from the expanded hit area`);
    await selectionPopover.waitFor();
  }
  const shortSelection = await selectionParagraph.evaluate(el => {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode, text = node.textContent ?? "";
      if (text.trim().length < 12) continue;
      const start = text.indexOf(text.trim());
      const points = Array.from({ length: 11 }, (_, offset) => {
        const caret = document.createRange(); caret.setStart(node, start + offset); caret.collapse(true);
        const rect = caret.getBoundingClientRect();
        return { x: rect.left, y: rect.top + rect.height / 2 };
      });
      const range = document.createRange(); range.setStart(node, start); range.setEnd(node, start + 6);
      const selection = window.getSelection()!; selection.removeAllRanges(); selection.addRange(range);
      return { text: text.slice(start, start + 6), surrounding: text.slice(start, start + 10), points };
    }
    throw new Error("Need text for short-selection regression");
  });
  await page.waitForFunction(text => window.getSelection()?.toString() === text, shortSelection.text);
  await page.waitForTimeout(60);
  for (const [name, initial, offsets] of [
    ["拖动调整选区终点", 6, [3, 2, 1, 4, 6]],
    ["拖动调整选区起点", 0, [3, 4, 5, 2, 0]],
  ] as const) {
    const handle = page.getByRole("button", { name });
    const bounds = (await handle.boundingBox())!;
    const grab = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
    await page.mouse.move(grab.x, grab.y); await page.mouse.down();
    await selectionPopover.waitFor({ state: "hidden" });
    for (const offset of offsets) {
      await page.mouse.move(grab.x + shortSelection.points[offset].x - shortSelection.points[initial].x, grab.y + shortSelection.points[offset].y - shortSelection.points[initial].y, { steps: 4 });
      const expected = initial === 6 ? shortSelection.text.slice(0, offset) : shortSelection.text.slice(offset);
      assert.equal(await page.evaluate(() => window.getSelection()!.toString()), expected, `${name} continuously shrinks to one character and expands again`);
    }
    await page.mouse.up();
    await selectionPopover.waitFor();
  }
  for (const [name, initial, fixed, offsets] of [
    ["拖动调整选区起点", 2, 6, [5, 7, 9, 4, 1, 2]],
    ["拖动调整选区终点", 6, 2, [3, 1, 0, 4, 7, 6]],
  ] as const) {
    await selectionParagraph.evaluate(el => {
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        const node = walker.currentNode, text = node.textContent ?? "";
        if (text.trim().length < 12) continue;
        const start = text.indexOf(text.trim()), range = document.createRange();
        range.setStart(node, start + 2); range.setEnd(node, start + 6);
        const selection = window.getSelection()!; selection.removeAllRanges(); selection.addRange(range);
        break;
      }
    });
    await page.waitForTimeout(60);
    const handle = page.getByRole("button", { name });
    const bounds = (await handle.boundingBox())!;
    const grab = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
    await page.mouse.move(grab.x, grab.y); await page.mouse.down();
    await selectionPopover.waitFor({ state: "hidden" });
    for (const offset of offsets) {
      await page.mouse.move(grab.x + shortSelection.points[offset].x - shortSelection.points[initial].x, grab.y, { steps: 4 });
      assert.equal(await page.evaluate(() => window.getSelection()!.toString()), shortSelection.surrounding.slice(Math.min(fixed, offset), Math.max(fixed, offset)), "The dragged boundary crosses and returns without releasing capture");
      assert.equal(await selectionPopover.isVisible(), false, "The toolbar stays hidden throughout adjustment");
      const activeName = offset < fixed ? "拖动调整选区起点" : "拖动调整选区终点";
      assert.equal(await page.getByRole("button", { name: activeName }).evaluate(el => el.hasPointerCapture(1)), true, "The same captured handle follows the moving endpoint");
    }
    await page.mouse.up();
    await selectionPopover.waitFor();
  }
  await page.keyboard.press("Escape");
  await selectionPopover.waitFor({ state: "hidden" });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.evaluate(() => window.scrollTo(0, 0));
  console.log("PASS: mouse selection stays stable while scrolling and excludes panel text");
  for (const position of ["停靠在右侧", "停靠在左侧", "全屏"]) {
    await mode(position);
    const heading = panel.locator(".reader-panel-heading");
    assert.equal(await heading.evaluate(el => getComputedStyle(el).cursor), "grab");
    const rect = (await heading.boundingBox())!;
    await page.mouse.move(rect.x + rect.width / 2, rect.y + 24);
    await page.mouse.down();
    await page.mouse.up();
    assert.notEqual(await panel.getAttribute("data-mode"), "floating", "A header click keeps the current mode");
    await page.mouse.down();
    await page.mouse.move(rect.x + rect.width / 2 + (position === "停靠在右侧" ? -60 : 60), rect.y + 64, { steps: 8 });
    await expectMode("floating");
    assert.equal(await heading.evaluate(el => getComputedStyle(el).cursor), "grabbing");
    await page.mouse.up();
    assert.equal(await heading.evaluate(el => getComputedStyle(el).cursor), "grab");
    const moved = (await panel.boundingBox())!;
    await drag(heading, -24, 20);
    assert.ok(Math.abs((await panel.boundingBox())!.x - moved.x + 24) < 2, "Detached window continues following header drags");
  }
  await mode("停靠在右侧");
  await panel.locator(".reader-chat-input").fill("追问未发送草稿");
  await switchView("笔记");
  const noteEditor = panel.getByRole("textbox", { name: "笔记内容" });
  assert.match(await noteEditor.innerText(), /fixture orphan note/, "Historical section notes remain available in the whole notebook");
  assert.equal(await panel.getByRole("combobox", { name: "笔记范围" }).count(), 0);
  assert.equal(await page.locator(".note-trigger").count(), 0);
  await writeNotebook(Array.from({ length: 35 }, (_, i) => `可完整滚动的笔记 ${i}`).join("\n\n"));
  await panel.locator(".reader-panel-scroll:visible").evaluate(el => { el.scrollTop = el.scrollHeight; });
  const lastNote = (await noteEditor.locator(".cm-line.notebook-line-editing").last().boundingBox())!;
  const writingBounds = (await panel.locator(".reader-panel-scroll:visible").boundingBox())!;
  assert.ok(lastNote.y + lastNote.height < writingBounds.y + writingBounds.height - 48, "Last note line remains readable above the bottom tool button");
  assert.equal(await panel.getByRole("button", { name: "保存笔记", exact: true }).count(), 0);
  assert.equal(await panel.getByRole("button", { name: "删除笔记", exact: true }).count(), 0);
  assert.equal(await panel.locator(".notebook-writing-surface").evaluate(el => getComputedStyle(el).direction), "ltr", "Scrollbar uses the right edge");
  await writeNotebook("笔记未保存草稿");
  assert.equal(await panel.getByRole("textbox", { name: "笔记内容" }).innerText(), "笔记未保存草稿");
  await page.locator(".reading-sheet p:not(:has(img))").first().click();
  assert.equal(await panel.isVisible(), true, "Reading must not dismiss the panel");
  await switchView("AI 助手");
  assert.equal(await panel.locator(".reader-chat-input").inputValue(), "追问未发送草稿");
  await switchView("笔记");
  assert.equal(await panel.getByRole("textbox", { name: "笔记内容" }).innerText(), "笔记未保存草稿");
  await panel.getByRole("button", { name: "收起窗口", exact: true }).click();
  await switchView("笔记");
  assert.equal(await panel.getByRole("textbox", { name: "笔记内容" }).innerText(), "笔记未保存草稿");
  await waitForNotebookSave();
  assert.equal(target.prepare("SELECT count(*) AS count FROM notes WHERE paper_id = ? AND section != ''").get(paperId).count, 0, "Saving consolidates historical section entries");
  const noteRoute = `${base}/papers/${paperId}`;
  const waitSaved = waitForNotebookSave;
  let releaseWrite!: () => void, receiveWrite!: () => void;
  const writeGate = new Promise<void>(resolve => { releaseWrite = resolve; });
  const writeReceived = new Promise<void>(resolve => { receiveWrite = resolve; });
  await page.route(noteRoute, async route => {
    if (route.request().method() === "POST" && route.request().postData()?.includes("auto-save-first")) {
      const response = await route.fetch(); receiveWrite(); await writeGate; await route.fulfill({ response });
    } else await route.continue();
  });
  await writeNotebook("auto-save-first"); await Promise.race([writeReceived, new Promise((_, reject) => setTimeout(() => reject(new Error("Autosave request did not start")), 15000))]);
  assert.equal(await noteEditor.getAttribute("contenteditable"), "true", "Saving does not interrupt editing");
  await writeNotebook("auto-save-latest"); releaseWrite(); await waitSaved();
  await page.unroute(noteRoute); await goto(); await switchView("笔记");
  assert.equal(await noteEditor.innerText(), "auto-save-latest", "A slow write never overwrites a newer edit");
  let failWrite = true;
  await page.route(noteRoute, async route => {
    if (failWrite && route.request().method() === "POST" && route.request().postData()?.includes("auto-save-retry")) {
      failWrite = false; await route.abort("failed");
    } else await route.continue();
  });
  await writeNotebook("auto-save-retry");
  await page.waitForFunction(() => document.querySelector(".reader-notebook")?.getAttribute("data-save-state") === "error");
  assert.equal(await page.evaluate(id => localStorage.getItem(`paper-notebook-draft:${id}`), paperId), "auto-save-retry");
  await goto(); await switchView("笔记"); await waitSaved();
  assert.equal(await noteEditor.innerText(), "auto-save-retry", "Failed writes recover the local draft after reload");
  await page.unroute(noteRoute);
  await writeNotebook("");
  await page.waitForFunction(() => document.querySelector(".cm-content")?.getAttribute("data-empty") === "true");
  await waitSaved(); await goto(); await switchView("笔记");
  assert.equal(await noteEditor.getAttribute("data-empty"), "true", "Clearing a note persists without a delete action");
  await page.screenshot({ path: path.join(fixture, "notebook-autosave.png") });
  await switchView("AI 助手");
  await panel.getByRole("button", { name: "新建对话", exact: true }).click();
  await panel.getByRole("button", { name: "历史会话", exact: true }).click();
  await panel.locator(".conversation-actions button").first().hover();
  await page.getByRole("tooltip").getByText("重命名", { exact: true }).waitFor();
  await panel.screenshot({ path: path.join(fixture, "conversation-management.png") });
  await panel.locator(".conversation-actions button").first().click();
  await panel.getByRole("textbox", { name: "对话名称" }).fill("窗口回归会话");
  await panel.getByRole("button", { name: "保存名称", exact: true }).click();
  await panel.locator(".conversation-name").filter({ hasText: "窗口回归会话" }).waitFor();
  const managementRow = panel.locator(".conversation-row").first();
  const managementName = (await managementRow.locator(".conversation-copy").boundingBox())!;
  const managementActions = (await managementRow.locator(".conversation-actions").boundingBox())!;
  assert.ok(managementName.x + managementName.width <= managementActions.x, "Conversation names stay separate from their icon actions");
  await panel.screenshot({ path: path.join(fixture, "conversation-management-renamed.png") });
  await page.keyboard.press("Escape");
  assert.equal(await panel.isVisible(), true, "History consumes Escape first");
  await panel.locator(".reader-chat-title>span").filter({ hasText: "窗口回归会话" }).waitFor();
  const conversationTitleBounds = (await panel.locator(".reader-chat-title").boundingBox())!;
  const conversationActionsBounds = (await panel.getByRole("button", { name: "历史会话", exact: true }).boundingBox())!;
  assert.ok(conversationTitleBounds.x + conversationTitleBounds.width <= conversationActionsBounds.x, "The conversation name and actions remain separate");
  await panel.screenshot({ path: path.join(fixture, "assistant-conversation-controls.png") });
  await panel.locator(".reader-chat-input").fill("__fixture_fail__");
  assert.equal(await panel.locator(".reader-chat-input").getAttribute("placeholder"), "输入问题…");
  await panel.getByRole("button", { name: "发送", exact: true }).click();
  await panel.getByRole("alert").waitFor();
  assert.equal(await panel.locator(".reader-chat-input").inputValue(), "__fixture_fail__");
  await panel.locator(".reader-chat-input").fill("关闭面板后继续回答");
  await panel.getByRole("button", { name: "发送", exact: true }).click();
  await panel.locator(".chat-pending").waitFor();
  await panel.getByRole("button", { name: "收起窗口", exact: true }).click();
  await page.waitForFunction(() => document.querySelector(".chat-assistant")?.textContent?.includes("本地模拟回答"));
  await switchView("AI 助手");
  // Stub only this page's clipboard; the user's system clipboard stays untouched.
  await page.evaluate("Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async function(value) { window.readerCopied = value; } } })");
  const userBubble = panel.locator(".chat-user").first();
  const userCopy = userBubble.getByRole("button", { name: "复制提问", exact: true });
  await panel.locator(".reader-panel-heading").hover();
  assert.equal(await userCopy.evaluate(el => getComputedStyle(el).opacity), "0", "User copy icon stays quiet until hover or keyboard focus");
  await userBubble.hover();
  assert.equal(await userCopy.evaluate(el => getComputedStyle(el).opacity), "1");
  assert.equal(await userBubble.evaluate(el => getComputedStyle(el).paddingRight), "48px", "Copy control has room without covering the question");
  await userCopy.click();
  assert.equal(await page.evaluate(() => (window as typeof window & { readerCopied?: string }).readerCopied), "关闭面板后继续回答");
  await userBubble.getByRole("button", { name: "已复制", exact: true }).waitFor();
  const answerCopy = panel.getByRole("button", { name: "复制回答", exact: true });
  assert.equal(await answerCopy.isVisible(), true, "Assistant answers can be copied without hovering");
  await answerCopy.click();
  assert.equal(await page.evaluate(() => (window as typeof window & { readerCopied?: string }).readerCopied), "这是本地模拟回答，用于验证关闭窗口后请求继续。");
  await panel.screenshot({ path: path.join(fixture, "assistant-message-copy.png") });
  await page.waitForTimeout(2100);
  // Exercise fallback, including focus/selection restoration, on local HTTP pages.
  await page.evaluate(`
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined });
    document.execCommand = function(command) {
      if (command !== 'copy') return false;
      window.readerCopied = document.activeElement.value;
      return true;
    };
  `);
  await panel.getByRole("button", { name: "复制回答", exact: true }).click();
  assert.equal(await page.evaluate(() => (window as typeof window & { readerCopied?: string }).readerCopied), "这是本地模拟回答，用于验证关闭窗口后请求继续。");
  assert.equal(await page.locator("textarea[data-clipboard-fallback]").count(), 0);
  await page.waitForTimeout(2100);
  await page.evaluate("document.execCommand = function() { return false; }");
  await panel.getByRole("button", { name: "复制回答", exact: true }).click();
  await panel.getByRole("button", { name: "复制失败，请重试", exact: true }).waitFor();
  console.log("PASS: hover-only question copy, always-visible answer copy, exact content, feedback and clipboard fallback/failure");
  await panel.getByRole("button", { name: "存为笔记", exact: true }).click();
  await panel.getByRole("button", { name: "已存为笔记", exact: true }).waitFor();
  await panel.locator(".reader-chat-title>span").filter({ hasText: "窗口回归会话" }).waitFor();
  await panel.getByRole("button", { name: "新建对话", exact: true }).click();
  await panel.locator(".reader-chat-input").fill("请解释这篇论文的核心方法以及其中最关键的设计选择");
  await panel.getByRole("button", { name: "发送", exact: true }).click();
  await panel.locator(".reader-chat-title>span").filter({ hasText: "拆开研究方法的黑箱" }).waitFor();
  await page.reload({ waitUntil: "networkidle" }); await switchView("AI 助手");
  await panel.locator(".reader-chat-title>span").filter({ hasText: "拆开研究方法的黑箱" }).waitFor();
  await panel.screenshot({ path: path.join(fixture, "assistant-ai-conversation-title.png") });
  await panel.getByRole("button", { name: "历史会话", exact: true }).click();
  await panel.getByRole("button", { name: "删除「拆开研究方法的黑箱」", exact: true }).click();
  await panel.getByRole("button", { name: "删除对话", exact: true }).click();
  await panel.locator(".reader-chat-title>span").filter({ hasText: "窗口回归会话" }).waitFor();
  console.log("PASS: AI conversation names replace first-question copies, persist after reload and preserve manual names");
  assert.ok(modelCalls >= 2);
  console.log("PASS: shared drafts, notes, section notes, orphan notes, conversations, failure recovery, background requests, answer saved");

  // Anchor stays at the same viewport offset while the paragraph reflows.
  await panel.getByRole("button", { name: "收起窗口", exact: true }).click();
  const anchor = page.locator(".reading-sheet .article p").nth(8);
  await anchor.evaluate(el => { window.scrollTo({ top: scrollY + el.getBoundingClientRect().top - 32, behavior: "instant" }); el.setAttribute("data-anchor-check", "true"); });
  const anchorTop = (await anchor.boundingBox())!.y;
  await switchView("AI 助手");
  assert.ok(Math.abs((await anchor.boundingBox())!.y - anchorTop) < 3, "Opening preserves reading block");
  const beforeWidth = (await panel.boundingBox())!.width;
  await drag(panel.getByRole("separator"), -70, 0);
  assert.ok((await panel.boundingBox())!.width > beforeWidth + 50);
  assert.ok(Math.abs((await anchor.boundingBox())!.y - anchorTop) < 3, "Dock resize preserves reading block");
  await mode("停靠在左侧");
  assert.ok((await panel.boundingBox())!.x < (await page.locator(".reader-copy").boundingBox())!.x);
  assert.ok(Math.abs((await anchor.boundingBox())!.y - anchorTop) < 3);
  await mode("浮动面板");
  assert.equal(Math.round((await panel.boundingBox())!.width), 480);
  await drag(panel.locator(".reader-panel-heading"), -130, 30);
  const floatingBefore = (await panel.boundingBox())!;
  for (const edge of ["n", "s", "e", "w", "ne", "nw", "se", "sw"]) {
    await drag(panel.locator(`[data-edge="${edge}"]`), edge.includes("w") ? -6 : edge.includes("e") ? 6 : 0, edge.includes("n") ? -5 : edge.includes("s") ? 5 : 0);
  }
  const floatingAfter = (await panel.boundingBox())!;
  assert.ok(floatingAfter.width > floatingBefore.width && floatingAfter.height > floatingBefore.height);
  await panel.getByRole("button", { name: "窗口位置", exact: true }).click();
  await page.keyboard.press("Escape");
  assert.equal(await panel.isVisible(), true, "Position menu consumes Escape first");
  await mode("全屏");
  await expectMode("fullscreen");
  assert.ok((await panel.boundingBox())!.width > 1200);
  await panel.getByRole("button", { name: "退出全屏", exact: true }).click();
  assert.deepEqual(await panel.boundingBox(), floatingAfter);
  await mode("全屏");
  await page.keyboard.press("Escape");
  await expectMode("floating");
  assert.equal(await panel.isVisible(), true, "Fullscreen Escape restores the prior window");
  await page.screenshot({ path: path.join(fixture, "floating.png") });
  for (const placement of ["浮动面板", "停靠在左侧", "全屏"]) {
    await mode(placement);
    await panel.getByRole("button", { name: "收起窗口", exact: true }).click();
    await panel.waitFor({ state: "hidden" });
    await switchView("AI 助手");
    await expectMode("right");
  }
  await page.reload({ waitUntil: "networkidle" });
  assert.equal(await panel.isVisible(), false);
  await switchView("AI 助手");
  await expectMode("right");
  await mode("浮动面板");
  assert.equal((await panel.boundingBox())!.width, floatingAfter!.width);
  assert.equal((await panel.boundingBox())!.height, floatingAfter!.height);
  await page.goto(`${base}/papers/${secondPaperId}`, { waitUntil: "networkidle" });
  assert.equal(await panel.isVisible(), false);
  await switchView("AI 助手");
  await expectMode("right");
  await mode("浮动面板");
  assert.equal((await panel.boundingBox())!.width, floatingAfter!.width, "Window sizes are shared across papers");
  assert.equal((await panel.boundingBox())!.height, floatingAfter!.height);
  await goto();
  assert.equal(await panel.isVisible(), false);
  await switchView("AI 助手");
  await mode("停靠在右侧");
  await page.setViewportSize({ width: 940, height: 720 });
  await expectMode("floating");
  assert.equal(await panel.getByRole("button", { name: "窗口位置", exact: true }).count(), 0);
  const compactTools = await tools.locator("button").evaluateAll(buttons => buttons.map(button => button.getBoundingClientRect().toJSON()));
  await panel.getByRole("button", { name: "收起窗口", exact: true }).click();
  await panel.waitFor({ state: "hidden" });
  assert.deepEqual(await tools.locator("button").evaluateAll(buttons => buttons.map(button => button.getBoundingClientRect().toJSON())), compactTools);
  await switchView("AI 助手");
  assert.deepEqual(await tools.locator("button").evaluateAll(buttons => buttons.map(button => button.getBoundingClientRect().toJSON())), compactTools);
  await panel.getByRole("button", { name: "全屏", exact: true }).click();
  await expectMode("fullscreen");
  await panel.getByRole("button", { name: "退出全屏", exact: true }).click();
  await expectMode("floating");
  await noOverflow();
  await page.setViewportSize({ width: 1440, height: 900 });
  await expectMode("right");
  await panel.getByRole("separator").focus();
  const keyboardWidth = (await panel.boundingBox())!.width;
  await page.keyboard.press("ArrowLeft");
  assert.equal(Math.round((await panel.boundingBox())!.width), Math.round(keyboardWidth + 16));
  console.log("PASS: reading anchor, drag, all eight resize handles, mode restore, persistence, narrow fallback, keyboard separator");
  for (const width of [1280, 1440, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    await mode("停靠在右侧");
    await noOverflow();
    const article = (await page.locator(".reader-copy").boundingBox())!, operation = (await panel.boundingBox())!;
    assert.ok(article.width >= 520 && article.x + article.width <= operation.x + 1);
    const text = (await page.locator(".reader-document-content").boundingBox())!;
    assert.equal(Math.round((await page.locator(".reader-sidebar").boundingBox())!.width), 168);
    if (width === 1920) assert.ok(Math.abs(text.x + text.width / 2 - width / 2) < 2, "Docked panel leaves the article centred on screen while it fits");
    assert.ok(await panel.getByRole("navigation", { name: "阅读工具" }).getByRole("button", { name: "笔记", exact: true }).isVisible());
    await page.screenshot({ path: path.join(fixture, `docked-${width}.png`) });
    await mode("停靠在左侧");
    await noOverflow();
    await mode("全屏");
    await noOverflow();
    await panel.getByRole("button", { name: "退出全屏", exact: true }).click();
  }
  const tocLink = page.getByRole("navigation", { name: "阅读目录" }).locator("a").nth(1);
  const targetId = (await tocLink.getAttribute("href"))!.slice(1);
  await tocLink.click();
  assert.equal(await panel.isVisible(), true);
  assert.ok(await page.getByRole("navigation", { name: "阅读目录" }).locator("a[aria-current=location]").count());
  const targetTop = await page.evaluate(id => document.getElementById(id)!.getBoundingClientRect().top, targetId);
  assert.ok(targetTop >= 16, "Directory target must remain visible");
  await switchView("论文信息");
  assert.ok(await panel.getByRole("link", { name: "PDF 全文" }).isVisible());
  assert.ok(await panel.getByRole("heading", { name: "同期值得关注的原论文" }).isVisible());
  await panel.locator(".reader-panel-scroll:visible").evaluate(el => { el.scrollTop = 0; });
  await page.screenshot({ path: path.join(fixture, "paper-information.png") });
  assert.equal(await page.locator(".reader-copy").getByRole("heading", { name: "同期值得关注的原论文" }).count(), 0);
  assert.ok(await page.locator(".reading-sheet .article").count());
  await switchView("AI 助手");
  const conversation = target.prepare("SELECT id FROM conversations WHERE subject = ? ORDER BY id DESC LIMIT 1").get(paperId) as { id: number };
  for (let i = 0; i < 24; i++) db.insert(schema.messages).values({ conversationId: conversation.id, role: i % 2 ? "assistant" : "user", content: `滚动回归 ${i}：${"保留当前会话的滚动位置。".repeat(30)}` }).run();
  await page.reload({ waitUntil: "networkidle" });
  await switchView("AI 助手");
  await panel.locator(".chat-messages").evaluate(el => { el.scrollTop = 180; el.dispatchEvent(new Event("scroll")); });
  await switchView("笔记");
  await switchView("AI 助手");
  assert.equal(await panel.locator(".chat-messages").evaluate(el => el.scrollTop), 180, "Switching tabs retains manually scrolled chat position");
  await panel.getByRole("button", { name: "历史会话", exact: true }).click();
  await panel.locator(".conversation-actions button[aria-label^='删除']").first().click();
  await panel.getByRole("button", { name: "删除对话", exact: true }).click();
  await panel.locator(".reader-chat-input").waitFor({ state: "visible" });
  assert.equal(await panel.locator(".chat-assistant").count(), 0);
  await switchView("笔记");
  assert.ok(await panel.getByRole("textbox", { name: "笔记内容" }).getByText("本地模拟回答", { exact: false }).isVisible(), "Deleting a conversation retains saved notes");
  // Storage-denied browsers must still support an in-memory working panel.
  const noStorage = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await noStorage.addCookies(await context.cookies());
  await noStorage.addInitScript(() => { Object.defineProperty(window, "localStorage", { get() { throw new Error("fixture storage denied"); } }); });
  const privatePage = await noStorage.newPage();
  await privatePage.goto(`${base}/papers/${paperId}`, { waitUntil: "networkidle" });
  await privatePage.getByRole("navigation", { name: "阅读工具" }).getByRole("button", { name: "AI 助手", exact: true }).click();
  assert.equal(await privatePage.locator("#reader-panel").getAttribute("data-mode"), "right");
  await privatePage.locator("#reader-panel").getByRole("button", { name: "窗口位置", exact: true }).click();
  await privatePage.getByRole("menuitemradio", { name: "浮动面板", exact: true }).click();
  assert.equal(await privatePage.locator("#reader-panel").getAttribute("data-mode"), "floating");
  await noStorage.close();
  await page.goto(`${base}/reports/${reportMonth}`, { waitUntil: "networkidle" });
  assert.equal(await page.locator(".reader-shell").getAttribute("data-kind"), "report");
  assert.equal(await page.locator(".room-header").isVisible(), false);
  assert.equal(await page.locator(".reader-sidebar").isVisible(), true);
  await switchView("笔记");
  const markdown = "## 在线预览\n\n**实时粗体**与 $x^2$\n\n| 项目 | 结论 |\n| --- | --- |\n| 月报 | 可编辑 |\n\n```js\nconst trend = true;\n```";
  await panel.getByRole("textbox", { name: "笔记内容" }).focus();
  await page.evaluate(text => {
    const transfer = new DataTransfer(); transfer.setData("text/plain", text);
    document.activeElement!.dispatchEvent(new ClipboardEvent("paste", { clipboardData: transfer, bubbles: true, cancelable: true }));
  }, markdown);
  const editor = panel.getByRole("textbox", { name: "笔记内容" });
  await panel.focus();
  await editor.getByRole("heading", { name: "在线预览" }).waitFor();
  assert.equal(await editor.locator("strong").textContent(), "实时粗体");
  assert.equal(await editor.locator("table").count(), 1);
  assert.ok(await editor.locator(".katex").count());
  await editor.locator("pre code").waitFor();
  assert.equal(await panel.getByRole("button", { name: "分栏", exact: true }).count(), 0);
  await page.screenshot({ path: path.join(fixture, "report-markdown-live.png") });
  assert.equal(await panel.getByRole("button", { name: "查看源码", exact: true }).count(), 0);
  assert.equal(await panel.getByRole("textbox", { name: "Markdown 源码" }).count(), 0);
  await waitForNotebookSave();
  assert.equal((target.prepare("SELECT content FROM notes WHERE paper_id = ? AND section = ''").get(`report:${reportMonth}`) as { content: string }).content, markdown, "Live editing preserves pasted Markdown exactly");
  await editor.focus(); await page.keyboard.press("Control+End");
  await page.keyboard.insertText("\n\n继续编辑已同步");
  await panel.focus();
  assert.ok(await editor.getByText("继续编辑已同步", { exact: true }).isVisible());
  assert.ok(await editor.getByRole("heading", { name: "在线预览" }).isVisible());
  await editor.getByRole("heading", { name: "在线预览" }).click();
  await page.keyboard.press("End");
  await page.keyboard.insertText("直接改写");
  assert.match(await editor.locator(".notebook-line-editing").innerText(), /## 在线预览直接改写/, "Editing a heading shows its original Markdown");
  assert.equal(await editor.getByRole("heading", { name: "在线预览直接改写" }).count(), 1, "Heading styling remains while editing its Markdown");
  assert.equal(await editor.getByRole("heading", { name: "在线预览直接改写" }).evaluate(el => getComputedStyle(el).fontSize), "22px");
  await panel.focus();
  await editor.getByRole("heading", { name: "在线预览直接改写" }).waitFor();
  await waitForNotebookSave();
  await switchView("AI 助手");
  await panel.locator(".reader-chat-input").fill("月报有哪些联系？");
  await panel.getByRole("button", { name: "发送", exact: true }).click();
  await panel.locator(".chat-assistant").waitFor();
  await page.reload({ waitUntil: "networkidle" });
  assert.equal(await panel.isVisible(), false);
  await switchView("笔记");
  assert.ok(await panel.getByRole("textbox", { name: "笔记内容" }).getByRole("heading", { name: "在线预览直接改写" }).isVisible());
  await writeNotebook("");
  const typed = panel.getByRole("textbox", { name: "笔记内容" });
  await typed.click();
  await page.keyboard.type("## "); await page.keyboard.insertText("输入即排版");
  assert.match(await typed.innerText(), /## 输入即排版/);
  assert.equal(await typed.locator("h2").count(), 0);
  await page.keyboard.press("Enter"); await page.keyboard.type("**typed bold** ");
  assert.equal(await typed.locator("strong").textContent(), "typed bold");
  await typed.locator("strong").click();
  assert.ok((await typed.locator(".cm-line.notebook-line-editing").last().innerText()).includes("**typed bold**"));
  await page.keyboard.press("End");
  await page.keyboard.insertText("中文连续输入");
  await page.keyboard.press("Control+z"); await page.keyboard.press("Control+Shift+Z");
  assert.match((await typed.innerText()), /中文连续输入/);
  await page.keyboard.press("ArrowUp");
  assert.match(await typed.locator(".cm-line.notebook-line-editing").first().innerText(), /## 输入即排版/);
  assert.equal(await typed.locator("strong").textContent(), "typed bold");
  await page.keyboard.press("ArrowDown");
  assert.equal(await typed.getByRole("heading", { name: "输入即排版" }).count(), 1);
  assert.equal(await typed.locator("strong").count(), 1, "Formatting remains intact when returning to a formatted line");
  await page.screenshot({ path: path.join(fixture, "notebook-active-source.png") });
  await mode("浮动面板");
  await page.screenshot({ path: path.join(fixture, "report-markdown.png") });
  await mode("停靠在右侧");
  await panel.getByRole("button", { name: "收起窗口", exact: true }).click();
  // Verify the reference's smooth opening and the reduced-motion opt-out separately.
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.evaluate(() => {
    const original = Element.prototype.animate;
    (window as unknown as { readerAnimations: unknown[] }).readerAnimations = [];
    Element.prototype.animate = function(keyframes, options) {
      if (this.classList.contains("reader-window-frame")) (window as unknown as { readerAnimations: unknown[] }).readerAnimations.push({ keyframes, options });
      return original.call(this, keyframes, options);
    };
  });
  const restingTools = await tools.locator("button").evaluateAll(buttons => buttons.map(button => button.getBoundingClientRect().toJSON()));
  await switchView("AI 助手");
  await panel.evaluate(async el => { await Promise.all(el.getAnimations({ subtree: true }).map(animation => animation.finished.catch(() => {}))); });
  assert.deepEqual(await tools.locator("button").evaluateAll(buttons => buttons.map(button => button.getBoundingClientRect().toJSON())), restingTools, "Tool buttons settle back into their final positions after unfolding");
  assert.equal(await page.evaluate(() => (window as unknown as { readerAnimations: unknown[] }).readerAnimations.length), 1);
  await panel.getByRole("button", { name: "收起窗口", exact: true }).click();
  assert.equal(await panel.isVisible(), true, "Closing keeps the frame visible until its exit animation finishes");
  await panel.waitFor({ state: "hidden" });
  assert.equal(await page.evaluate(() => (window as unknown as { readerAnimations: { options: { duration: number } }[] }).readerAnimations.at(-1)?.options.duration), 310);
  await page.emulateMedia({ reducedMotion: "reduce" });
  const animationsBeforeReducedOpen = await page.evaluate(() => (window as unknown as { readerAnimations: unknown[] }).readerAnimations.length);
  await switchView("AI 助手");
  assert.equal(await page.evaluate(() => (window as unknown as { readerAnimations: unknown[] }).readerAnimations.length), animationsBeforeReducedOpen, "Reduced motion opens without animating the frame");
  await mode("浮动面板");
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.evaluate(() => {
    const original = Element.prototype.animate;
    Element.prototype.animate = function(keyframes, options) {
      const animation = original.call(this, keyframes, options);
      if (this.classList.contains("reader-window-frame")) {
        animation.pause();
        ((window as unknown as { minimizeAnimations: Animation[] }).minimizeAnimations ??= []).push(animation);
      }
      return animation;
    };
  });
  const windowFrame = panel.locator(".reader-window-frame");
  const fullWindow = (await windowFrame.boundingBox())!, fullRail = (await tools.boundingBox())!;
  await panel.getByRole("button", { name: "收起窗口", exact: true }).click();
  await page.evaluate(() => { (window as unknown as { minimizeAnimations: Animation[] }).minimizeAnimations.forEach(animation => { animation.currentTime = 110; }); });
  const shrinkingWindow = (await windowFrame.boundingBox())!, shrinkingRail = (await tools.boundingBox())!;
  assert.ok(shrinkingWindow.width < fullWindow.width * .8, "Floating close shrinks the window frame");
  assert.ok(Math.abs(shrinkingRail.width - fullRail.width) < 1, "Tools keep their natural size while the window scales");
  assert.equal(await tools.evaluate(el => !!el.closest("[inert]")), false, "Tools can reverse a close");
  await page.screenshot({ path: path.join(fixture, "floating-minimize.png") });
  // Reverse a paused exit; the first opening frame must match the visible exit frame.
  await tools.getByRole("button", { name: "AI 助手", exact: true }).click();
  assert.ok(Math.abs((await windowFrame.boundingBox())!.width - shrinkingWindow.width) < 1, "Reopening continues from the current visible size");
  await page.evaluate(() => { (window as unknown as { minimizeAnimations: Animation[] }).minimizeAnimations.forEach(animation => animation.finish()); });
  await panel.getByRole("button", { name: "收起窗口", exact: true }).click();
  await page.evaluate(() => { (window as unknown as { minimizeAnimations: Animation[] }).minimizeAnimations.forEach(animation => animation.finish()); });
  await panel.waitFor({ state: "hidden" });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await switchView("AI 助手");
  assert.equal(await panel.evaluate(el => getComputedStyle(el).transform), "none", "Reopening clears the minimizing transform");
  console.log("PASS: embedded controls, report workspace, persistent monthly notes/Q&A, live Markdown/math/tables/code, smooth window motion, interrupted close and reduced motion");
  // Existing shared styles are also used by report pages and admin assistants.
  for (const route of ["/library", "/admin/selection", "/reports"]) {
    assert.equal((await page.goto(base + route, { waitUntil: "networkidle" }))?.status(), 200);
    await noOverflow();
  }
  await page.goto(`${base}/papers/${secondPaperId}`, { waitUntil: "networkidle" });
  await switchView("笔记");
  const referenceNote = "# 标题\n\n*斜体* **加粗** ***加粗斜体***\n\n1. 有序1\n2. 有序2\n\n> 引用\n\n- 无序1\n- 无序2";
  await writeNotebook(referenceNote);
  await panel.focus();
  const referenceEditor = panel.getByRole("textbox", { name: "笔记内容" });
  await referenceEditor.getByRole("heading", { name: "标题", exact: true }).waitFor();
  await waitForNotebookSave();
  await page.screenshot({ path: path.join(fixture, "notebook-reference-style.png") });
  await panel.screenshot({ path: path.join(fixture, "notebook-reference-panel.png") });
  const paragraph = referenceEditor.locator(".cm-line").filter({ hasText: "斜体" }).first();
  const dragStart = (await paragraph.boundingBox())!;
  const dragEnd = await referenceEditor.getByText("有序1", { exact: true }).evaluate(el => {
    const range = document.createRange(); range.selectNodeContents(el); return range.getBoundingClientRect().toJSON();
  });
  await page.mouse.move(dragStart.x + 2, dragStart.y + dragStart.height / 2);
  await page.mouse.down();
  await page.mouse.move(dragEnd.right + 3, dragEnd.y + dragEnd.height / 2, { steps: 12 });
  await page.mouse.up();
  assert.match(await page.evaluate(() => document.getSelection()?.toString() ?? ""), /斜体/);
  assert.match(await page.evaluate(() => document.getSelection()?.toString() ?? ""), /有序1/, "Dragging from a rendered paragraph extends through the next list item");
  await panel.focus();
  const secondItem = referenceEditor.getByText("有序2", { exact: true });
  const firstGlyph = await secondItem.evaluate(el => {
    const range = document.createRange(); range.setStart(el.firstChild!, 0); range.setEnd(el.firstChild!, 1);
    return range.getBoundingClientRect().toJSON();
  });
  await page.mouse.click(firstGlyph.right - 1, firstGlyph.y + firstGlyph.height / 2);
  await page.keyboard.insertText("测");
  assert.equal(await referenceEditor.locator(".notebook-line-editing").innerText(), "2. 有测序2", "Clicking a rendered glyph positions the caret at that character in its source");
  assert.ok(await referenceEditor.getByText("有序1", { exact: true }).isVisible(), "Editing one list item leaves its neighbour rendered");
  await page.keyboard.press("End"); await page.keyboard.press("Enter"); await page.keyboard.insertText("第三项");
  assert.equal(await referenceEditor.locator(".notebook-line-editing").innerText(), "3. 第三项", "Enter continues ordered list numbering");
  const ime = await context.newCDPSession(page);
  await ime.send("Input.imeSetComposition", { text: "中文", selectionStart: 2, selectionEnd: 2 });
  await ime.send("Input.insertText", { text: "中文输入" });
  assert.equal(await referenceEditor.locator(".notebook-line-editing").innerText(), "3. 第三项中文输入", "IME commits once without moving the caret");
  await ime.detach();
  await page.keyboard.press("Control+z"); await page.keyboard.press("Control+Shift+Z");
  assert.match(await referenceEditor.locator(".notebook-line-editing").innerText(), /中文输入/);
  await panel.focus();
  await referenceEditor.getByText("第三项中文输入", { exact: true }).waitFor();
  await page.screenshot({ path: path.join(fixture, "notebook-reference-edited.png") });
  // Reproduce the supplied recording: stable heading, live bullet, empty-item exit, quote continuation.
  await writeNotebook("# 标题\n\n*斜体* **加粗** ***加粗斜体***\n\n1. 有序1\n2. 有序2\n\n");
  const videoHeading = referenceEditor.getByRole("heading", { name: "标题", exact: true });
  const headingSize = await videoHeading.evaluate(el => getComputedStyle(el).fontSize);
  await videoHeading.click();
  assert.equal(await videoHeading.evaluate(el => getComputedStyle(el).fontSize), headingSize);
  assert.ok((await videoHeading.innerText()).startsWith("#"), "The heading marker appears without shrinking the title");
  await page.keyboard.press("Control+End");
  await page.keyboard.type("- ");
  assert.equal(await referenceEditor.locator(".notebook-list-bullet").count(), 1, "Typing a bullet prefix immediately shows its coloured marker");
  const videoIme = await context.newCDPSession(page);
  await videoIme.send("Input.imeSetComposition", { text: "wu", selectionStart: 2, selectionEnd: 2 });
  await videoIme.send("Input.insertText", { text: "无序" });
  await page.keyboard.press("Enter");
  assert.equal(await referenceEditor.locator(".notebook-list-bullet").count(), 2);
  await page.keyboard.press("Enter");
  assert.equal(await referenceEditor.locator(".notebook-list-bullet").count(), 1, "Enter on an empty item exits the list");
  await page.keyboard.type("> ");
  assert.equal(await referenceEditor.locator(".notebook-quote-line").count(), 1);
  await videoIme.send("Input.imeSetComposition", { text: "yin", selectionStart: 3, selectionEnd: 3 });
  await videoIme.send("Input.insertText", { text: "引用" });
  await page.keyboard.press("Enter");
  const quoteLines = referenceEditor.locator(".notebook-quote-line");
  assert.equal(await quoteLines.count(), 2);
  assert.equal(await quoteLines.first().innerText(), "引用");
  assert.ok((await quoteLines.last().innerText()).startsWith(">"));
  assert.equal(await quoteLines.last().evaluate(el => getComputedStyle(el).borderLeftWidth), "3px", "The quote border remains while typing source");
  assert.equal(await referenceEditor.evaluate(el => getComputedStyle(el).outlineStyle), "none", "The editable surface has no extra focus frame");
  await videoIme.detach();
  await waitForNotebookSave();
  await panel.screenshot({ path: path.join(fixture, "notebook-video-match.png") });
  // Highlights: selected reading text is persisted separately, searchable and re-anchored after reload.
  assert.equal(await referenceEditor.evaluate(el => getComputedStyle(el).fontSize), "13px");
  async function addSelectedHighlight(index: number) {
    const paragraph = page.locator(".reader-body p").nth(index);
    await paragraph.scrollIntoViewIfNeeded();
    const quote = await paragraph.evaluate(el => {
      const range = document.createRange(); range.selectNodeContents(el);
      const selection = window.getSelection()!; selection.removeAllRanges(); selection.addRange(range);
      return range.toString().trim();
    });
    await page.getByRole("dialog", { name: "选中文字" }).getByRole("button", { name: "笔记", exact: true }).click();
    await page.getByRole("button", { name: "保存高亮笔记", exact: true }).click();
    await panel.locator(".notebook-highlight-jump").filter({ hasText: quote }).waitFor();
    return quote;
  }
  const firstQuote = await addSelectedHighlight(0);
  const secondQuote = await addSelectedHighlight(1);
  assert.notEqual(firstQuote, secondQuote);
  assert.equal(await panel.locator(".notebook-highlight-item").count(), 2);
  const comment = panel.getByRole("textbox", { name: "高亮批注", exact: true }).first();
  await comment.fill("搜索专用批注"); await comment.press("Tab");
  await panel.locator(".notebook-highlight-item [role=status]").waitFor({ state: "hidden" });
  assert.equal((target.prepare("SELECT comment FROM reading_highlights WHERE subject_id = ? ORDER BY start LIMIT 1").get(secondPaperId) as { comment: string }).comment, "搜索专用批注");
  const searchHighlights = panel.getByRole("searchbox", { name: "搜索高亮标记" });
  await searchHighlights.fill("搜索专用");
  assert.equal(await panel.locator(".notebook-highlight-item:visible").count(), 1, "Search includes annotation text");
  await searchHighlights.fill("不存在的关键词");
  await panel.getByText("无匹配结果", { exact: true }).waitFor();
  await panel.getByRole("button", { name: "清空搜索" }).click();
  assert.equal(await panel.locator(".notebook-highlight-item").count(), 2);
  await page.reload({ waitUntil: "networkidle" }); await switchView("笔记");
  await panel.locator(".notebook-highlight-item").nth(1).waitFor();
  assert.equal(await panel.getByRole("textbox", { name: "高亮批注", exact: true }).first().inputValue(), "搜索专用批注");
  const paintCount = await page.evaluate(() => (CSS as typeof CSS & { highlights: Map<string, { size: number }> }).highlights.get("reading-highlight-ffe066")?.size);
  assert.equal(paintCount, 2, "Both stored ranges are painted in the reading text");
  await panel.locator(".notebook-highlight-jump").first().click();
  assert.equal(await page.evaluate(() => (CSS as typeof CSS & { highlights: Map<string, { size: number }> }).highlights.get("reading-highlight-active")?.size), 1);
  await panel.locator(".reader-panel-scroll:visible").evaluate(el => { el.scrollTop = 0; });
  await panel.screenshot({ path: path.join(fixture, "notebook-highlights.png") });
  await page.screenshot({ path: path.join(fixture, "reading-highlights.png") });
  await panel.getByRole("button", { name: "删除高亮标记" }).last().click();
  await page.waitForFunction(() => document.querySelectorAll(".notebook-highlight-item").length === 1);
  assert.equal((target.prepare("SELECT count(*) AS n FROM reading_highlights WHERE subject_id = ?").get(secondPaperId) as { n: number }).n, 1);
  assert.equal(await panel.getByRole("textbox", { name: "笔记内容" }).innerText().then(text => text.includes("标题")), true, "Deleting highlights leaves the notebook untouched");
  const mathParagraph = page.locator(".reader-body p").filter({ hasText: "高亮公式起始" });
  await mathParagraph.scrollIntoViewIfNeeded();
  await page.waitForTimeout(150); // Finish the scroll event before creating the selection toolbar.
  const rawMathQuote = await mathParagraph.evaluate(el => {
    const range = document.createRange(); range.selectNodeContents(el);
    const selection = window.getSelection()!; selection.removeAllRanges(); selection.addRange(range);
    return range.toString().trim();
  });
  await page.getByRole("dialog", { name: "选中文字" }).getByRole("button", { name: "笔记", exact: true }).click();
  await page.getByRole("button", { name: "保存高亮笔记", exact: true }).click();
  const mathQuote = panel.locator(".notebook-highlight-jump").filter({ hasText: "高亮公式起始" });
  await mathQuote.locator(".highlight-quote-math .katex").waitFor();
  assert.equal(await mathQuote.locator(".highlight-quote-math").count(), 1, "Hidden MathML/source is replaced with one rendered formula");
  assert.equal(await mathQuote.locator('annotation[encoding="application/x-tex"]').textContent(), highlightLatex);
  const mathRecord = target.prepare("SELECT id, quote FROM reading_highlights WHERE subject_id = ? ORDER BY id DESC LIMIT 1").get(secondPaperId) as { id: number; quote: string };
  assert.equal(mathRecord.quote, rawMathQuote, "Saved anchor offsets remain compatible with existing math highlights");
  const bands = page.locator(`.reader-highlight-layer [data-highlight-id="${mathRecord.id}"]`);
  await bands.first().waitFor({ state: "attached" });
  const bandHeights = await bands.evaluateAll(elements => elements.map(el => el.getBoundingClientRect().height));
  assert.ok(bandHeights.every(height => Math.abs(height - 25.2) < .1), "Text, formulas and subscripts share a uniform marker height");
  assert.equal(await page.locator(".reader-highlight-layer").evaluate(el => getComputedStyle(el).pointerEvents), "none");
  await page.screenshot({ path: path.join(fixture, "math-highlights.png") });
  await panel.screenshot({ path: path.join(fixture, "math-highlight-notes.png") });
  await page.reload({ waitUntil: "networkidle" }); await switchView("笔记");
  await panel.locator(".notebook-highlight-jump").filter({ hasText: "高亮公式起始" }).locator(".katex").waitFor();
  await panel.locator(".notebook-highlight-jump").filter({ hasText: "高亮公式起始" }).click();
  await page.screenshot({ path: path.join(fixture, "math-highlights-reloaded.png") });
  console.log("PASS: math highlight quotes render once, survive reload, retain anchor data and use uniform marker heights");
  await page.goto(`${base}/reports/${reportMonth}`, { waitUntil: "networkidle" }); await switchView("笔记");
  await panel.getByText("选中文字可添加高亮", { exact: true }).waitFor();
  assert.equal(await panel.locator(".notebook-highlight-item").count(), 0, "Reports have their own highlight scope");
  console.log("PASS: selected text highlights, comment autosave, search, reload, original-text navigation, deletion and subject isolation");
  assert.deepEqual(errors, []);
  console.log(`PASS: desktop layouts, directory, resources, adjacent routes, no browser exceptions. Screenshots: ${fixture}`);
} catch (error) {
  const failedPage = browser?.contexts()[0]?.pages()[0];
  if (failedPage) {
    await failedPage.screenshot({ path: path.join(fixture, "failure.png") });
    console.error(await failedPage.evaluate(() => ({ focus: document.activeElement?.outerHTML.slice(0, 500), panel: document.querySelector("#reader-panel")?.getBoundingClientRect().toJSON(), notebook: document.querySelector(".cm-content")?.outerHTML.slice(0, 3000) })));
  }
  console.error(logs);
  throw error;
} finally {
  await browser?.close();
  server.kill();
  model.close();
  target.close();
  if (originalNextEnv && fs.readFileSync(nextEnvFile, "utf8").includes(".next-reader-panel-check/")) fs.writeFileSync(nextEnvFile, originalNextEnv);
}
